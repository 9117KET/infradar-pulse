/**
 * backfill-runner
 *
 * Bounded dispatcher for the public-data archive queue. It claims one job with
 * a short lease, invokes exactly one source agent, and persists the returned
 * cursor/progress. A failed provider call is recorded and the job is paused
 * after repeated failures instead of being retried in a tight loop.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Content-Type": "application/json",
};

const MAX_JOBS_PER_RUN = 1;
const LEASE_MINUTES = 20;
const MAX_CONSECUTIVE_ERRORS = 3;
const ALLOWED_FUNCTIONS = new Set([
  "world-bank-ingest-agent", "ifc-ingest-agent", "adb-ingest-agent", "iadb-ingest-agent",
  "aiib-ingest-agent", "gem-ingest-agent", "eib-ingest-agent",
]);

type BackfillJob = {
  id: string;
  source_key: string;
  agent_type: string;
  agent_function: string;
  params: Record<string, unknown>;
  page_size: number;
  cursor_offset: number;
  fetched_count: number;
  total_estimate: number | null;
  state: string;
  priority: number;
  consecutive_errors: number;
};

type AgentResult = {
  success?: boolean;
  paused?: boolean;
  skipped?: boolean;
  fetched?: number;
  total?: number;
  next_offset?: number;
  offset?: number;
  exhausted?: boolean;
  mode?: string;
  error?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isTerminalProviderError(message: string): boolean {
  return /\b(402|403)\b|credits|forbidden|disabled/i.test(message);
}

async function claimNextJob(supabase: ReturnType<typeof createClient>): Promise<BackfillJob | null> {
  const { data, error } = await supabase
    .from("backfill_jobs")
    .select("*")
    .in("state", ["pending", "running"])
    .or(`last_run_at.is.null,last_run_at.lt.${new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString()}`)
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const leaseTime = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("backfill_jobs")
    .update({ state: "running", last_run_at: leaseTime, last_error: null })
    .eq("id", data.id)
    .in("state", ["pending", "running"])
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  return (claimed ?? null) as BackfillJob | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!await isAgentEnabled(supabase, "backfill-runner")) return pausedResponse("backfill-runner");

  let job: BackfillJob | null = null;
  try {
    job = await claimNextJob(supabase);
    if (!job) return json({ success: true, idle: true, message: "No backfill work is currently pending." });
    if (!ALLOWED_FUNCTIONS.has(job.agent_function)) {
      await supabase.from("backfill_jobs").update({ state: "paused", last_error: "Agent function is not allow-listed." }).eq("id", job.id);
      return json({ success: false, paused: true, error: "Backfill source is not allow-listed." }, 400);
    }

    const params = { ...job.params, mode: "backfill", limit: job.page_size };
    const response = await fetch(`${supabaseUrl}/functions/v1/${job.agent_function}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        ...(Deno.env.get("AGENT_CRON_SECRET") ? { "x-cron-secret": Deno.env.get("AGENT_CRON_SECRET") as string } : {}),
      },
      body: JSON.stringify(params),
    });
    const raw = await response.text();
    let result: AgentResult = {};
    try { result = JSON.parse(raw) as AgentResult; } catch { result = { error: raw.slice(0, 1000) }; }

    if (!response.ok || result.error && result.success === false) {
      const message = result.error || `Source agent returned HTTP ${response.status}`;
      const nextErrors = (job.consecutive_errors ?? 0) + 1;
      const paused = isTerminalProviderError(`${response.status} ${message}`) || nextErrors >= MAX_CONSECUTIVE_ERRORS;
      await supabase.from("backfill_jobs").update({
        state: paused ? "paused" : "pending",
        consecutive_errors: nextErrors,
        last_error: message.slice(0, 2000),
      }).eq("id", job.id);
      return json({ success: false, job_id: job.id, paused, status: response.status, error: message }, response.status >= 400 ? response.status : 500);
    }

    const fetched = Number(result.fetched ?? result.total ?? 0);
    const explicitOffset = Number(result.next_offset ?? result.offset);
    const nextOffset = Number.isFinite(explicitOffset) && explicitOffset >= 0
      ? explicitOffset
      : job.cursor_offset + Math.max(fetched, 0);
    const exhausted = result.exhausted === true || (result.mode === "backfill" && fetched === 0);
    const completed = exhausted || (job.total_estimate !== null && nextOffset >= job.total_estimate);

    await supabase.from("backfill_jobs").update({
      state: completed ? "completed" : "pending",
      cursor_offset: nextOffset,
      fetched_count: (job.fetched_count ?? 0) + Math.max(fetched, 0),
      consecutive_errors: 0,
      last_error: null,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", job.id);

    return json({ success: true, job_id: job.id, source_key: job.source_key, fetched, next_offset: nextOffset, completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job) {
      await supabase.from("backfill_jobs").update({ state: "paused", last_error: message.slice(0, 2000), consecutive_errors: (job.consecutive_errors ?? 0) + 1 }).eq("id", job.id);
    }
    console.error("backfill-runner error", message);
    return json({ success: false, paused: Boolean(job), error: "Backfill runner failed." }, 500);
  }
});
