// Paddle webhook handler. Receives subscription + transaction events and syncs
// the public.subscriptions table. Webhook URL and secret are pre-registered by
// the Lovable Paddle integration. ?env=sandbox|live picks the right secret.
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
  pro_monthly: 'pro',
};

function priceIdToPlanKey(priceId: string | undefined): string {
  if (priceId && PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId];
  console.warn('payments-webhook: unknown price external_id, defaulting to starter:', priceId);
  return 'starter';
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
        break;
      // Updated covers: trial → active, active → past_due, paused, resumed, plan changes,
      // and scheduled-cancel. Status field on payload tells us which.
      case EventName.SubscriptionUpdated:
        await upsertSubscription(event.data, env, false);
        break;
      case EventName.SubscriptionCanceled:
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('paddle_subscription_id', event.data.id)
          .eq('environment', env);
        break;
      case EventName.TransactionCompleted:
        console.log('Transaction completed:', event.data.id);
        break;
      case EventName.TransactionPaymentFailed:
        console.log('Payment failed:', event.data.id);
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

  const userId = customData?.userId;
  if (!userId) {
    console.error('payments-webhook: no userId in customData; cannot link subscription', id);
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

  if (isCreate) {
    await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id,environment' });
  } else {
    // Use upsert too so a rogue 'updated' before 'created' doesn't drop the row.
    await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id,environment' });
  }
}
