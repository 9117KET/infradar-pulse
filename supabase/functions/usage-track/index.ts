// Server-side gated usage tracking for exports and insight reads.
// Replaces direct client RPC calls so limits cannot be bypassed by editing the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromBearer } from "../_shared/auth.ts";
import {
  assertExportAllowed,
  assertInsightReadAllowed,
  incrementUsage,
  Metric,
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
    if (!action || !ALLOWED.includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Gate before incrementing
    let gate;
    if (action === "insight_read") {
      gate = await assertInsightReadAllowed(supabaseAdmin, user.id);
    } else {
      const kind = action === "export_csv" ? "csv" : "pdf";
      gate = await assertExportAllowed(supabaseAdmin, user.id, kind);
    }
    if (gate.ok === false) {
      return new Response(
        JSON.stringify({ error: gate.message, code: "ENTITLEMENT", plan: gate.plan }),
        { status: 402, headers: corsHeaders },
      );
    }

    await incrementUsage(supabaseAdmin, user.id, action as Metric);

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
