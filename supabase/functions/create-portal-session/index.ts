/**
 * Stripe Customer Portal for managing subscription / payment method.
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
    const origin =
      (body.origin as string | undefined) ||
      req.headers.get("origin") ||
      Deno.env.get("SITE_URL") ||
      "http://localhost:5173";

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: row } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!row?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "No billing account yet. Subscribe from Pricing first." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin.replace(/\/$/, "")}/dashboard/settings?tab=billing`,
    });

    return new Response(JSON.stringify({ url: portal.url }), { headers: corsHeaders });
  } catch (e) {
    console.error("create-portal-session:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
