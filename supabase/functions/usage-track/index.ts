// Server-side gated usage tracking for exports and insight reads.
// Uses the atomic consume*Quota helpers so parallel requests cannot
// bypass either the daily or the hourly cap.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromBearer } from "../_shared/auth.ts";
import {
  consumeExportQuota,
  consumeInsightReadQuota,
  requireVerifiedEmail,
} from "../_shared/entitlementCheck.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type Action = "export_csv" | "export_pdf" | "insight_read";
const ALLOWED: Action[] = ["export_csv", "export_pdf", "insight_read"];

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
        JSON.stringify({ error: "Sign in required." }),
        { status: 401, headers: corsHeaders },
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action;
    const environment = body?.environment === "sandbox" ? "sandbox" : "live";
    if (!action || !ALLOWED.includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Email verification gate: stops throwaway accounts from burning quota.
    const verified = await requireVerifiedEmail(supabaseAdmin, user.id);
    if (verified.ok === false) {
      return new Response(
        JSON.stringify({ error: verified.message, code: "EMAIL_UNVERIFIED" }),
        { status: 403, headers: corsHeaders },
      );
    }

    // Atomic gate + increment in a single DB transaction.
    // Returns ok=false if either the daily or hourly cap would be exceeded.
    let gate;
    if (action === "insight_read") {
      gate = await consumeInsightReadQuota(supabaseAdmin, user.id, environment);
    } else {
      const kind = action === "export_csv" ? "csv" : "pdf";
      gate = await consumeExportQuota(supabaseAdmin, user.id, kind, environment);
    }
    if (gate.ok === false) {
      return new Response(
        JSON.stringify({
          error: gate.message,
          code: "ENTITLEMENT",
          plan: gate.plan,
          reason: gate.reason, // 'daily' | 'hourly'
        }),
        { status: 402, headers: corsHeaders },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: corsHeaders },
    );
  }
});
