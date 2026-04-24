import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromBearer } from "./auth.ts";
import { consumeAiQuota, getEntitlementForUser, requireVerifiedEmail } from "./entitlementCheck.ts";
import { PlanKey, planMeetsMinimum } from "./billing.ts";

export const corsJson = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

/**
 * Returns userId if allowed, or a ready Response (401/402).
 * The quota is atomically consumed (daily + hourly) when this resolves
 * with a userId, so callers should NOT call recordAiUsage afterwards.
 */
export async function requireAiEntitlementOrRespond(req: Request): Promise<
  | { userId: string; supabaseAdmin: ReturnType<typeof createClient> }
  | Response
> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: corsJson,
    });
  }
  const user = await getUserFromBearer(req, supabaseUrl, anonKey);
  if (!user) {
    return new Response(JSON.stringify({ error: "Sign in required to run AI features." }), {
      status: 401,
      headers: corsJson,
    });
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const body = req.method === "POST" ? await req.clone().json().catch(() => ({})) : {};
  const environment = body?.environment === "sandbox" ? "sandbox" : "live";

  // Email verification gate: stops disposable/unconfirmed accounts from
  // burning AI quota. Staff bypass.
  const verified = await requireVerifiedEmail(supabaseAdmin, user.id);
  if (verified.ok === false) {
    return new Response(
      JSON.stringify({ error: verified.message, code: "EMAIL_UNVERIFIED" }),
      { status: 403, headers: corsJson },
    );
  }

  // Atomic: gates AND consumes one unit of AI quota in a single transaction.
  const gate = await consumeAiQuota(supabaseAdmin, user.id, environment);
  if (gate.ok === false) {
    return new Response(
      JSON.stringify({ error: gate.message, code: "ENTITLEMENT", reason: gate.reason }),
      { status: 402, headers: corsJson },
    );
  }
  return { userId: user.id, supabaseAdmin };
}

/**
 * Like requireAiEntitlementOrRespond but also enforces a minimum plan tier
 * before consuming quota. Use this for features that should be restricted to
 * paid plans regardless of remaining free-tier AI credits.
 *
 * Returns 402 with code "PLAN_REQUIRED" when the user's plan is below minPlan.
 * Staff (admin/researcher) and lifetime users always bypass the plan check.
 *
 * Example: `requirePlanAndAiOrRespond(req, "pro")` gates a Pro-only feature.
 */
export async function requirePlanAndAiOrRespond(
  req: Request,
  minPlan: PlanKey,
): Promise<
  | { userId: string; supabaseAdmin: ReturnType<typeof createClient> }
  | Response
> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: corsJson,
    });
  }
  const user = await getUserFromBearer(req, supabaseUrl, anonKey);
  if (!user) {
    return new Response(JSON.stringify({ error: "Sign in required to run AI features." }), {
      status: 401,
      headers: corsJson,
    });
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const body = req.method === "POST" ? await req.clone().json().catch(() => ({})) : {};
  const environment = body?.environment === "sandbox" ? "sandbox" : "live";

  const verified = await requireVerifiedEmail(supabaseAdmin, user.id);
  if (verified.ok === false) {
    return new Response(
      JSON.stringify({ error: verified.message, code: "EMAIL_UNVERIFIED" }),
      { status: 403, headers: corsJson },
    );
  }

  const ent = await getEntitlementForUser(supabaseAdmin, user.id, environment);

  // Staff and lifetime users bypass plan-level gates entirely.
  if (!ent.bypass && !planMeetsMinimum(ent.plan, minPlan)) {
    const label = minPlan.charAt(0).toUpperCase() + minPlan.slice(1);
    return new Response(
      JSON.stringify({
        error: `This feature requires the ${label} plan or higher. Upgrade to access it.`,
        code: "PLAN_REQUIRED",
        requiredPlan: minPlan,
        currentPlan: ent.plan,
      }),
      { status: 402, headers: corsJson },
    );
  }

  // Atomic quota gate + consumption (staff bypass is handled inside consumeAiQuota).
  const gate = await consumeAiQuota(supabaseAdmin, user.id, environment);
  if (gate.ok === false) {
    return new Response(
      JSON.stringify({ error: gate.message, code: "ENTITLEMENT", reason: gate.reason }),
      { status: 402, headers: corsJson },
    );
  }
  return { userId: user.id, supabaseAdmin };
}

/**
 * @deprecated Quota is now consumed inside requireAiEntitlementOrRespond.
 * This is a no-op kept so existing call sites continue to compile. New code
 * should not call this.
 */
export async function recordAiUsage(
  _supabaseAdmin: ReturnType<typeof createClient>,
  _userId: string
): Promise<void> {
  // Intentionally a no-op. Quota was already consumed atomically by the gate.
}
