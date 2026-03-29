/**
 * Verifies Stripe signatures and mirrors subscription state into Supabase.
 * Configure endpoint in Stripe Dashboard → Webhooks; set STRIPE_WEBHOOK_SECRET.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";
import { resolvePlanKeyFromPriceId } from "../_shared/billing.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function upsertSubscriptionRow(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sub: Stripe.Subscription
) {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const planKey = resolvePlanKeyFromPriceId(priceId ?? undefined);
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: priceId,
      plan_key: planKey,
      current_period_end: periodEnd,
      trial_end: trialEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

async function resolveUserIdFromCustomer(
  supabase: ReturnType<typeof createClient>,
  customerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

serve(async (req) => {
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return new Response("STRIPE_WEBHOOK_SECRET not set", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(`Webhook Error: ${err instanceof Error ? err.message : "unknown"}`, {
      status: 400,
    });
  }

  const supabase = getSupabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const customerId = typeof session.customer === "string" ? session.customer : null;
        if (userId && customerId) {
          await supabase.from("stripe_customers").upsert(
            { user_id: userId, stripe_customer_id: customerId },
            { onConflict: "user_id" }
          );
        }
        const subId = typeof session.subscription === "string" ? session.subscription : null;
        if (subId && userId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscriptionRow(supabase, userId, sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const metaUser = sub.metadata?.supabase_user_id;
        let userId: string | null = metaUser ?? null;
        if (!userId && typeof sub.customer === "string") {
          userId = await resolveUserIdFromCustomer(supabase, sub.customer);
        }
        if (userId) {
          await upsertSubscriptionRow(supabase, userId, sub);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId =
          sub.metadata?.supabase_user_id ??
          (typeof sub.customer === "string"
            ? await resolveUserIdFromCustomer(supabase, sub.customer)
            : null);
        if (userId) {
          await supabase
            .from("subscriptions")
            .update({
              status: "canceled",
              cancel_at_period_end: false,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("stripe-webhook handler error:", e);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
