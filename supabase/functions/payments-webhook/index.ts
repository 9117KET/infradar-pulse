// Paddle webhook handler. Receives subscription, transaction, and adjustment
// events and syncs the public.subscriptions table + billing_events audit log.
// Webhook URL and secret are pre-registered by the Lovable Paddle integration.
// ?env=sandbox|live picks the right secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhook, EventName, type PaddleEnv } from '../_shared/paddle.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Map of every active Paddle price external_id → internal plan_key.
// Add new SKUs here when you create them.
const PRICE_TO_PLAN: Record<string, string> = {
  starter_monthly: 'starter',
  starter_yearly: 'starter',
  pro_monthly: 'pro',
  pro_yearly: 'pro',
  lifetime_pro_onetime: 'lifetime',
};

// Price IDs that grant lifetime (one-time, non-recurring) access.
const LIFETIME_PRICE_IDS = new Set<string>(['lifetime_pro_onetime']);
const LIFETIME_MAX_SEATS = 100;

function priceIdToPlanKey(priceId: string | undefined): string {
  if (priceId && PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];
  console.warn('payments-webhook: unknown price external_id, defaulting to starter:', priceId);
  return 'starter';
}

/**
 * Resolve the user_id for a webhook event.
 *
 * 1. Prefer customData.userId (set during checkout).
 * 2. Fall back to looking up the existing subscription row by Paddle subscription ID.
 *    Paddle's subscription.updated events sometimes drop customData, which would
 *    otherwise drop the upsert and leave the local row stale.
 */
async function resolveUserId(
  customData: { userId?: string } | null | undefined,
  paddleSubscriptionId: string | undefined,
  env: PaddleEnv,
): Promise<string | null> {
  if (customData?.userId) return customData.userId;
  if (!paddleSubscriptionId) return null;
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('paddle_subscription_id', paddleSubscriptionId)
    .eq('environment', env)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Look up the user via a Paddle customer_id (used for adjustment events). */
async function userIdForCustomer(
  customerId: string | undefined,
  env: PaddleEnv,
): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('paddle_customer_id', customerId)
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

  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;

  try {
    const event = await verifyWebhook(req, env);
    console.log('payments-webhook event:', event.eventType, 'env:', env);

    switch (event.eventType) {
      case EventName.SubscriptionCreated:
        await upsertSubscription(event.data, env, true);
        await logBillingEvent(event, env);
        break;
      // Updated covers: trial → active, active → past_due, paused, resumed, plan changes,
      // and scheduled-cancel. Status field on payload tells us which.
      case EventName.SubscriptionUpdated:
        await upsertSubscription(event.data, env, false);
        await logBillingEvent(event, env);
        break;
      case EventName.SubscriptionCanceled:
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('paddle_subscription_id', event.data.id)
          .eq('environment', env);
        await logBillingEvent(event, env);
        break;
      // Dedicated event for past_due. Stamp local status and surface an alert
      // so the user sees it on next dashboard load.
      case EventName.SubscriptionPastDue:
        await upsertSubscription(event.data, env, false);
        await logBillingEvent(event, env);
        await emitPastDueAlert(event.data, env);
        break;
      case EventName.TransactionCompleted:
        console.log('Transaction completed:', event.data.id);
        await maybeGrantLifetime(event.data, env);
        await logBillingEvent(event, env);
        break;
      case EventName.TransactionPaymentFailed:
        console.log('Payment failed:', event.data.id);
        await logBillingEvent(event, env);
        break;
      // Refund / chargeback events. Paddle is Merchant of Record so they
      // process these — we just record them in the audit log so the user can
      // see exactly what happened, when, and for how much.
      case EventName.AdjustmentCreated:
      case EventName.AdjustmentUpdated:
        await logAdjustmentEvent(event, env);
        break;
      default:
        console.log('Unhandled event:', event.eventType);
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
async function upsertSubscription(data: any, env: PaddleEnv, isCreate: boolean) {
  const { id, customerId, items, status, currentBillingPeriod, customData, scheduledChange } = data;

  // Try customData first (always set on subscription.created), fall back to
  // looking up the existing row by Paddle sub ID for subscription.updated
  // events that may drop customData.
  const userId = await resolveUserId(customData, id, env);
  if (!userId) {
    console.error('payments-webhook: cannot resolve userId for sub', id, '(customData missing and no existing row)');
    return;
  }

  const item = items?.[0];
  const priceId = item?.price?.importMeta?.externalId || item?.price?.id;
  const productId = item?.product?.importMeta?.externalId || item?.product?.id;
  const planKey = priceIdToPlanKey(priceId);

  // Trial end: prefer item.trialDates.endsAt (Paddle sets this on trial subs);
  // fall back to currentBillingPeriod.endsAt while status === 'trialing'.
  const trialEnd =
    item?.trialDates?.endsAt ??
    (status === 'trialing' && currentBillingPeriod?.endsAt ? currentBillingPeriod.endsAt : null);

  const row = {
    user_id: userId,
    paddle_subscription_id: id,
    paddle_customer_id: customerId,
    product_id: productId,
    price_id: priceId,
    plan_key: planKey,
    status,
    current_period_start: currentBillingPeriod?.startsAt ?? null,
    current_period_end: currentBillingPeriod?.endsAt ?? null,
    trial_end: trialEnd,
    cancel_at_period_end: scheduledChange?.action === 'cancel',
    environment: env,
    updated_at: new Date().toISOString(),
  };

  // Upsert in both create + update paths so a rogue 'updated' before 'created'
  // doesn't drop the row.
  const _ = isCreate; // kept for log clarity; same code path either way
  await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id,environment' });

  // Anti-abuse: record that this user has now used a trial. Idempotent.
  // We only record on trialing status so paid subs don't burn the trial flag.
  if (status === 'trialing') {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email ?? null;
      await supabase.rpc('record_trial_started', {
        p_user_id: userId,
        p_email: email,
        p_paddle_customer_id: customerId ?? null,
        p_environment: env,
      });
    } catch (err) {
      console.error('record_trial_started failed (non-fatal):', err);
    }
  }
}

// Records every Paddle event into billing_events for the user-facing audit log.
// deno-lint-ignore no-explicit-any
async function logBillingEvent(event: any, env: PaddleEnv) {
  try {
    const data = event.data ?? {};
    const isSub = String(event.eventType ?? '').startsWith('subscription.');
    const subscriptionId = isSub ? data.id : data.subscriptionId ?? null;
    const customerId = data.customerId ?? null;
    const status = data.status ?? null;
    const item = data.items?.[0];
    const priceExt = item?.price?.importMeta?.externalId || item?.price?.id;
    const planKey =
      priceExt === 'pro_monthly' ? 'pro' : priceExt === 'starter_monthly' ? 'starter' : null;

    // Same fallback as upsertSubscription: prefer customData, fall back to lookup.
    const userId = await resolveUserId(data.customData, subscriptionId, env);

    await supabase.from('billing_events').insert({
      user_id: userId,
      paddle_subscription_id: subscriptionId,
      paddle_customer_id: customerId,
      event_type: event.eventType,
      status,
      plan_key: planKey,
      environment: env,
      occurred_at: event.occurredAt ?? new Date().toISOString(),
      payload: event,
    });
  } catch (err) {
    console.error('logBillingEvent failed:', err);
  }
}

// Adjustments are refunds, credits, or chargebacks. Paddle handles the money;
// we just log them for the user's audit trail.
// deno-lint-ignore no-explicit-any
async function logAdjustmentEvent(event: any, env: PaddleEnv) {
  try {
    const data = event.data ?? {};
    const userId = await userIdForCustomer(data.customerId, env);
    await supabase.from('billing_events').insert({
      user_id: userId,
      paddle_subscription_id: data.subscriptionId ?? null,
      paddle_customer_id: data.customerId ?? null,
      // event_type already encodes whether this is a refund / chargeback / credit
      event_type: event.eventType,
      // Adjustments use 'action' (refund | credit | chargeback | chargeback_warning | chargeback_reverse)
      // and 'status' (pending | approved | rejected). Stash both in the status column
      // for the audit table — formatted as "<action>:<status>" so the UI can split.
      status: [data.action, data.status].filter(Boolean).join(':') || null,
      plan_key: null,
      environment: env,
      occurred_at: event.occurredAt ?? new Date().toISOString(),
      payload: event,
    });
  } catch (err) {
    console.error('logAdjustmentEvent failed:', err);
  }
}

// On past_due, drop a row into the public alerts table so it surfaces on the
// dashboard. We tag it with category='financial' and severity='high' so the
// existing alerts UI handles it without changes.
// deno-lint-ignore no-explicit-any
async function emitPastDueAlert(data: any, env: PaddleEnv) {
  try {
    const userId = await resolveUserId(data.customData, data.id, env);
    if (!userId) return;
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? 'your account';
    await supabase.from('alerts').insert({
      project_name: 'Billing',
      message: `Your last payment failed for ${email}. Update your payment method in Settings → Billing to keep access.`,
      severity: 'high',
      category: 'financial',
    });
  } catch (err) {
    console.error('emitPastDueAlert failed (non-fatal):', err);
  }
}
