// Lemon Squeezy webhook handler. Receives subscription and order events and
// syncs the public.subscriptions table + billing_events audit log, the same
// tables the (dormant) Paddle webhook wrote to — entitlement resolution in
// _shared/entitlementCheck.ts is provider-agnostic and doesn't care which
// webhook populated the row.
//
// Environment is derived per-event from `data.attributes.test_mode`, not a
// query param — Lemon Squeezy has one store with a test-mode toggle, not a
// separate sandbox/live account pair like Paddle.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, lsEnvFromTestMode, type LsEnv } from '../_shared/lemonsqueezy.ts';
import { variantIdToPlanKey, isLifetimeVariant } from '../_shared/lemonsqueezyPlans.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Lemon Squeezy's subscription status vocabulary doesn't match ours 1:1 —
// normalize to the same strings the (dormant) Paddle webhook wrote, since
// entitlementCheck.ts's effectivePlan() and the has_active_subscription /
// has_paid_or_staff_access RPCs all key off 'trialing'/'canceled' (not
// 'on_trial'/'cancelled').
function normalizeStatus(status: string | undefined): string {
  if (status === 'on_trial') return 'trialing';
  if (status === 'cancelled') return 'canceled';
  if (status === 'expired') return 'canceled';
  return status ?? 'active';
}

/**
 * Resolve the user_id for a webhook event.
 *
 * 1. Prefer meta.custom_data.user_id (set when the checkout was created).
 * 2. Fall back to looking up the existing subscription row by LS subscription ID.
 */
async function resolveUserId(
  customData: Record<string, unknown> | null | undefined,
  lsSubscriptionId: string | undefined,
  env: LsEnv,
): Promise<string | null> {
  const fromCustom = customData?.user_id;
  if (typeof fromCustom === 'string' && fromCustom) return fromCustom;
  if (!lsSubscriptionId) return null;
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('ls_subscription_id', lsSubscriptionId)
    .eq('environment', env)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Look up the user via an LS customer_id (used when custom_data is absent, e.g. orders). */
async function userIdForCustomer(customerId: string | undefined, env: LsEnv): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('ls_customer_id', customerId)
    .eq('environment', env)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const event = await verifyWebhook(req);
    const eventName = event.meta?.event_name;
    console.log('lemonsqueezy-webhook event:', eventName);

    switch (eventName) {
      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_resumed':
      case 'subscription_unpaused':
      case 'subscription_paused':
        await upsertSubscription(event);
        await logBillingEvent(event);
        break;
      case 'subscription_cancelled':
      case 'subscription_expired':
        await upsertSubscription(event);
        await logBillingEvent(event);
        break;
      case 'subscription_payment_success':
        await upsertSubscription(event);
        await logBillingEvent(event);
        break;
      case 'subscription_payment_failed': {
        await logBillingEvent(event);
        const env = lsEnvFromTestMode(event.data.attributes.test_mode as boolean);
        await emitPastDueAlert(event, env);
        break;
      }
      case 'order_created':
        await maybeGrantLifetime(event);
        await logBillingEvent(event);
        break;
      default:
        console.log('Unhandled event:', eventName);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('Webhook error', { status: 400 });
  }
});

// deno-lint-ignore no-explicit-any
async function upsertSubscription(event: any) {
  const { data, meta } = event;
  const attrs = data.attributes;
  const env = lsEnvFromTestMode(attrs.test_mode);

  const userId = await resolveUserId(meta?.custom_data, data.id, env);
  if (!userId) {
    console.error('lemonsqueezy-webhook: cannot resolve userId for sub', data.id, '(custom_data missing and no existing row)');
    return;
  }

  const variantId = attrs.variant_id != null ? String(attrs.variant_id) : undefined;
  const planKey = variantIdToPlanKey(variantId);
  const status = normalizeStatus(attrs.status);

  const row: Record<string, unknown> = {
    user_id: userId,
    provider: 'lemonsqueezy',
    ls_subscription_id: data.id,
    ls_customer_id: attrs.customer_id != null ? String(attrs.customer_id) : null,
    ls_product_id: attrs.product_id != null ? String(attrs.product_id) : null,
    ls_variant_id: variantId ?? null,
    plan_key: planKey,
    status,
    // LS doesn't expose a period-start timestamp (only a billing_anchor day-of-month).
    current_period_start: null,
    current_period_end: attrs.ends_at ?? attrs.renews_at ?? null,
    trial_end: attrs.trial_ends_at ?? null,
    // LS: `cancelled` is true once cancellation is scheduled but before the
    // subscription actually ends — same meaning as Paddle's cancel_at_period_end.
    cancel_at_period_end: !!attrs.cancelled,
    environment: env,
    updated_at: new Date().toISOString(),
  };

  await supabase.from('subscriptions').upsert(row, { onConflict: 'ls_subscription_id,environment' });

  if (status === 'trialing') {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email ?? null;
      await supabase.rpc('record_trial_started', {
        p_user_id: userId,
        p_email: email,
        p_paddle_customer_id: row.ls_customer_id ?? null,
        p_environment: env,
      });
    } catch (err) {
      console.error('record_trial_started failed (non-fatal):', err);
    }
  }

  if (['active', 'trialing', 'past_due'].includes(status) && planKey !== 'free') {
    await markReferralConverted(userId, {
      environment: env,
      planKey,
      priceId: variantId,
      subscriptionId: data.id,
    });
  }
}

async function markReferralConverted(
  userId: string,
  details: { environment: LsEnv; planKey: string; priceId: string | undefined; subscriptionId: string },
) {
  try {
    await supabase
      .from('referral_events')
      .update({
        converted_to_paid: true,
        conversion_environment: details.environment,
        conversion_plan_key: details.planKey,
        conversion_price_id: details.priceId ?? null,
        conversion_subscription_id: details.subscriptionId,
        converted_at: new Date().toISOString(),
        reward_status: 'earned',
      })
      .eq('referred_id', userId)
      .eq('converted_to_paid', false);
  } catch (err) {
    console.error('markReferralConverted failed (non-fatal):', err);
  }
}

// Records every LS event into billing_events for the user-facing audit log.
// deno-lint-ignore no-explicit-any
async function logBillingEvent(event: any) {
  try {
    const { data, meta } = event;
    const attrs = data.attributes ?? {};
    const env = lsEnvFromTestMode(attrs.test_mode);
    const isSub = String(data.type ?? '').startsWith('subscription');
    const lsSubscriptionId = isSub ? data.id : attrs.subscription_id ?? null;
    const lsOrderId = data.type === 'orders' ? data.id : attrs.order_id ?? null;
    const lsCustomerId = attrs.customer_id != null ? String(attrs.customer_id) : null;
    const status = attrs.status ? normalizeStatus(attrs.status) : null;
    const variantId = attrs.variant_id != null ? String(attrs.variant_id)
      : attrs.first_order_item?.variant_id != null ? String(attrs.first_order_item.variant_id)
      : undefined;
    const planKey = variantId ? variantIdToPlanKey(variantId) : null;

    const userId = await resolveUserId(meta?.custom_data, lsSubscriptionId, env)
      ?? await userIdForCustomer(lsCustomerId ?? undefined, env);

    await supabase.from('billing_events').insert({
      user_id: userId,
      provider: 'lemonsqueezy',
      ls_subscription_id: lsSubscriptionId,
      ls_customer_id: lsCustomerId,
      ls_order_id: lsOrderId,
      event_type: meta?.event_name,
      status,
      plan_key: planKey,
      environment: env,
      occurred_at: new Date().toISOString(),
      payload: event,
    });
  } catch (err) {
    console.error('logBillingEvent failed:', err);
  }
}

// On payment failure, drop a row into the public alerts table so it surfaces
// on the dashboard — same pattern as the (dormant) Paddle webhook. Do NOT
// embed the user's email/PII; the alerts table is broadly readable.
// deno-lint-ignore no-explicit-any
async function emitPastDueAlert(event: any, env: LsEnv) {
  try {
    const { data, meta } = event;
    const userId = await resolveUserId(meta?.custom_data, data.id, env);
    if (!userId) return;
    await supabase.from('alerts').insert({
      project_name: 'Billing',
      message: 'Your last payment failed for your account. Update your payment method in Settings → Billing to keep access.',
      severity: 'high',
      category: 'financial',
    });
  } catch (err) {
    console.error('emitPastDueAlert failed (non-fatal):', err);
  }
}

/**
 * Lifetime grant handler. On `order_created` for the lifetime variant, call
 * the atomic seat-claim RPC (shared 100-seat pool with Paddle/admin grants).
 * Idempotent: if the user already has a grant, claim_lifetime_seat_ls no-ops.
 */
// deno-lint-ignore no-explicit-any
async function maybeGrantLifetime(event: any) {
  try {
    const { data, meta } = event;
    const attrs = data.attributes;
    const env = lsEnvFromTestMode(attrs.test_mode);
    const variantId = attrs.first_order_item?.variant_id != null ? String(attrs.first_order_item.variant_id) : undefined;
    if (!isLifetimeVariant(variantId)) return;

    const customerId = attrs.customer_id != null ? String(attrs.customer_id) : undefined;
    const userId = await resolveUserId(meta?.custom_data, undefined, env)
      ?? await userIdForCustomer(customerId, env);
    if (!userId) {
      console.error('maybeGrantLifetime: cannot resolve userId for order', data.id);
      return;
    }

    const { data: seat, error } = await supabase.rpc('claim_lifetime_seat_ls', {
      p_user_id: userId,
      p_environment: env,
      p_ls_order_id: data.id,
      p_ls_customer_id: customerId ?? null,
      p_max_seats: 100,
    });
    if (error) {
      console.error('claim_lifetime_seat_ls failed:', error);
      return;
    }
    console.log('Lifetime grant recorded for', userId, 'seat:', seat);
  } catch (err) {
    console.error('maybeGrantLifetime failed (non-fatal):', err);
  }
}
