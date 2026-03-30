/**
 * source-ingest-agent
 *
 * Controlled ingestion path for authenticated/premium external sources.
 * Phase A (implemented): fetch URL with optional cookie header, store text-ish content in raw_sources,
 * then optionally run AI extraction to create/update projects/insights in later iterations.
 *
 * NOTE: Full browser automation for paywalled sites should NOT run inside Edge Functions.
 * This function supports cookie-based fetch + audit trail storage only.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", data).then((buf) =>
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const sourceKey = typeof body?.source_key === "string" ? body.source_key.trim() : "";
    if (!url || !url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "url is required" }), { status: 400, headers: corsHeaders });
    }

    const cookie = Deno.env.get("SOURCE_SESSION_COOKIE") ?? "";
    const userAgent = Deno.env.get("INGEST_USER_AGENT") ?? "InfraRadarIngest/1.0";

    const { data: task, error: taskErr } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "source-ingest",
        query: url,
        status: "running",
        requested_by: gate.userId,
        result: { step: "fetching" },
      })
      .select("id")
      .single();
    if (taskErr) throw new Error(`Failed to create task: ${taskErr.message}`);
    const taskId = task.id as string;

    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        ...(cookie ? { Cookie: cookie } : {}),
        Accept: "text/html,application/pdf,application/json;q=0.9,*/*;q=0.8",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    const isTexty = contentType.includes("text/") || contentType.includes("json") || contentType.includes("xml") || contentType.includes("html");

    let contentText = "";
    if (isTexty) {
      contentText = await res.text();
    } else {
      // For binary (PDF) we store a minimal placeholder and metadata; use a worker + PDF parser later.
      contentText = "";
    }

    const hash = await sha256Hex(`${url}\n${contentText}`);

    const { error: insErr } = await supabase.from("raw_sources").insert({
      source_key: sourceKey,
      url,
      title: "",
      source_type: contentType.includes("pdf") ? "pdf" : "html",
      content_text: contentText.slice(0, 200_000), // keep bounded; raw_sources is audit not a blob store
      content_hash: hash,
      metadata: { status: res.status, content_type: contentType, fetched_ok: res.ok },
    });
    if (insErr) throw new Error(`Failed to insert raw_sources: ${insErr.message}`);

    await supabase
      .from("research_tasks")
      .update({
        status: "completed",
        result: { step: "completed", url, fetched_ok: res.ok, status: res.status, content_type: contentType },
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    return new Response(JSON.stringify({ success: true, taskId, url, status: res.status, contentType }), { headers: corsHeaders });
  } catch (e) {
    console.error("source-ingest-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: corsHeaders });
  }
});

