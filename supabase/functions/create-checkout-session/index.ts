/**
 * Creates a Stripe Checkout Session (subscription, 3-day trial). Requires JWT.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromBearer } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const user = await getUserFromBearer(req, supabaseUrl, anonKey);
    if (!user) {
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const priceId =
      (body.priceId as string | undefined) || Deno.env.get("STRIPE_PRICE_STARTER");
    if (!priceId) {
      return new Response(JSON.stringify({ error: "No price configured (STRIPE_PRICE_STARTER)" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const origin =
      (body.origin as string | undefined) ||
      req.headers.get("origin") ||
      Deno.env.get("SITE_URL") ||
      "http://localhost:5173";

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: existing } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin.replace(/\/$/, "")}/dashboard/settings?tab=billing&checkout=success`,
      cancel_url: `${origin.replace(/\/$/, "")}/pricing`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        trial_period_days: 3,
        metadata: { supabase_user_id: user.id },
      },
    };

    if (existing?.stripe_customer_id) {
      sessionParams.customer = existing.stripe_customer_id;
    } else if (user.email) {
      sessionParams.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), { headers: corsHeaders });
  } catch (e) {
    console.error("create-checkout-session:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
