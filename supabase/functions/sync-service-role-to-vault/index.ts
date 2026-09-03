// One-shot admin utility: copies the platform-managed scheduler secrets into
// the database vault so pg_cron can authenticate without storing credentials
// in cron definitions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { isCronRequest } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const agentCronSecret = Deno.env.get("AGENT_CRON_SECRET");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server configuration error" }, 500);
    }

    // The nightly scheduler can self-heal the rotating service-role secret.
    // An administrator can also run this endpoint after rotating AGENT_CRON_SECRET,
    // which closes the otherwise unavoidable vault/function secret mismatch.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    if (!isCronRequest(req)) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ error: "unauthenticated" }, 401);

      const { data: isAdmin } = await admin.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin",
      });
      if (!isAdmin) return json({ error: "admin role required" }, 403);
    }

    const serviceSync = await admin.rpc("upsert_vault_secret", {
      p_name: "email_queue_service_role_key",
      p_secret: serviceRoleKey,
    });
    if (serviceSync.error) return json({ error: serviceSync.error.message }, 500);

    if (agentCronSecret?.trim()) {
      const cronSync = await admin.rpc("upsert_vault_secret", {
        p_name: "agent_cron_secret",
        p_secret: agentCronSecret.trim(),
      });
      if (cronSync.error) return json({ error: cronSync.error.message }, 500);
    }

    return json({
      ok: true,
      message: agentCronSecret?.trim()
        ? "Scheduler secrets synchronized into the database vault."
        : "Service role key synchronized; scheduler secret is not configured.",
      synced: {
        service_role: true,
        agent_cron_secret: Boolean(agentCronSecret?.trim()),
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
