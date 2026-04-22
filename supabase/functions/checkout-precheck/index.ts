// Pre-checkout eligibility check.
//
// Called by the frontend before opening Paddle Checkout. Returns whether the
// signed-in user is eligible for a free trial. The frontend uses this to
// decide whether to show the "Start trial" CTA or send the user straight to
// a paid checkout (no trial period).
//
// This is the ONLY authoritative check. The actual enforcement happens at
// checkout creation time on Paddle's side via the trial_period parameter
// being omitted, so a tampered client can't conjure a trial they didn't
// earn.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromBearer } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const user = await getUserFromBearer(req, supabaseUrl, anonKey);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Sign in required" }),
        { status: 401, headers: corsHeaders },
      );
    }

    const body = await req.json().catch(() => ({}));
    const env = (body?.environment === "live" ? "live" : "sandbox") as
      | "live"
      | "sandbox";

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Find any existing paddle customer id we have on file for this user.
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("paddle_customer_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .maybeSingle();

    const { data: eligible, error } = await supabaseAdmin.rpc(
      "check_trial_eligible",
      {
        p_user_id: user.id,
        p_email: user.email ?? null,
        p_paddle_customer_id: existing?.paddle_customer_id ?? null,
        p_environment: env,
      },
    );
    if (error) {
      console.error("check_trial_eligible error", error);
      // Fail closed: assume not eligible on error so we don't grant abuse trials.
      return new Response(
        JSON.stringify({ trialEligible: false, reason: "check_failed" }),
        { status: 200, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        trialEligible: !!eligible,
        reason: eligible ? null : "trial_already_used",
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: corsHeaders },
    );
  }
});
