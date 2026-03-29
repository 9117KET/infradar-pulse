import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromBearer } from "./auth.ts";
import { assertAiAllowed, incrementUsage } from "./entitlementCheck.ts";

export const corsJson = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

/** Returns userId if allowed, or a ready Response (401/402). */
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
  const gate = await assertAiAllowed(supabaseAdmin, user.id);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.message, code: "ENTITLEMENT" }), {
      status: 402,
      headers: corsJson,
    });
  }
  return { userId: user.id, supabaseAdmin };
}

export async function recordAiUsage(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  await incrementUsage(supabaseAdmin, userId, "ai_generation");
}
