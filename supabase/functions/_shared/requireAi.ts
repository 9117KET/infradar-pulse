import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromBearer } from "./auth.ts";
import { consumeAiQuota } from "./entitlementCheck.ts";

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
  // Atomic: gates AND consumes one unit of AI quota in a single transaction.
  const gate = await consumeAiQuota(supabaseAdmin, user.id);
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
