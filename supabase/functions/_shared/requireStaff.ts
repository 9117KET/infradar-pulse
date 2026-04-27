/**
 * JWT + admin/researcher role check for batch agents that mutate global project data.
 * Uses service role client after verifying the caller is staff via hasStaffBypass.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromBearer } from "./auth.ts";
import { hasStaffBypass } from "./entitlementCheck.ts";

const corsJson: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

export { corsJson as staffCorsJson };

export async function requireStaffOrRespond(req: Request): Promise<
  | { userId: string | null; supabaseAdmin: ReturnType<typeof createClient> }
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
  // Allow service_role JWTs (used by pg_cron scheduled invocations).
  // Service role tokens have no `sub` claim so getUser() returns null - bypass
  // the normal user lookup and grant admin access directly.
  const rawAuth = req.headers.get("Authorization") ?? "";
  if (rawAuth.startsWith("Bearer ")) {
    try {
      const payload = JSON.parse(atob(rawAuth.slice(7).split(".")[1]));
      if (payload?.role === "service_role") {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        return { userId: null, supabaseAdmin };
      }
    } catch { /* not decodeable - fall through to normal auth */ }
  }

  const user = await getUserFromBearer(req, supabaseUrl, anonKey);
  if (!user) {
    return new Response(JSON.stringify({ error: "Sign in required." }), {
      status: 401,
      headers: corsJson,
    });
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const ok = await hasStaffBypass(supabaseAdmin, user.id);
  if (!ok) {
    return new Response(
      JSON.stringify({
        error: "This agent is restricted to team accounts (admin or researcher).",
        code: "STAFF_ONLY",
      }),
      { status: 403, headers: corsJson },
    );
  }
  return { userId: user.id, supabaseAdmin };
}
