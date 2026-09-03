/**
 * backfill-runner
 *
 * Bounded dispatcher for the public-data archive queue. It acquires a database
 * lease, claims one source job, invokes exactly one source agent, and persists
 * the returned cursor/progress. Failures are parked instead of retried in a
 * tight loop.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Content-Type": "application/json",
};

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
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("backfill_jobs")
    .select("*")
    .in("state", ["pending", "running"])
    .or(`lease_until.is.null,lease_until.lt.${now}`)
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const leaseUntil = new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("backfill_jobs")
    .update({
      state: "running",
      lease_until: leaseUntil,
      last_run_at: now,
      attempts: (data.attempts ?? 0) + 1,
      last_error: null,
    })
    .eq("id", data.id)
    .in("state", ["pending", "running"])
    .or(`lease_until.is.null,lease_until.lt.${now}`)
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
  const holder = crypto.randomUUID();
  let job: BackfillJob | null = null;

  if (!await isAgentEnabled(supabase, "backfill-runner")) return pausedResponse("backfill-runner");

  const { data: lockAcquired, error: lockError } = await supabase.rpc("acquire_backfill_runner_lock", {
    p_holder: holder,
    p_lease_minutes: LEASE_MINUTES,
  });
  if (lockError) {
    console.error("backfill-runner lock acquisition failed", lockError.message);
    return json({ success: false, error: "Backfill runner lock unavailable." }, 503);
  }
  if (lockAcquired !== true) return json({ success: true, skipped: true, reason: "runner_locked" });

  try {
    job = await claimNextJob(supabase);
    if (!job) return json({ success: true, idle: true, message: "No backfill work is currently pending." });
    if (!ALLOWED_FUNCTIONS.has(job.agent_function)) {
      await supabase.from("backfill_jobs").update({ state: "paused", lease_until: null, last_error: "Agent function is not allow-listed." }).eq("id", job.id);
      return json({ success: false, paused: true, error: "Backfill source is not allow-listed." }, 400);
    }

    const params = { ...job.params, mode: "backfill", limit: job.page_size };
    const cronSecret = Deno.env.get("AGENT_CRON_SECRET");
    const response = await fetch(`${supabaseUrl}/functions/v1/${job.agent_function}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        ...(cronSecret ? { "x-cron-secret": cronSecret } : {}),
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
        lease_until: null,
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
      lease_until: null,
      cursor_offset: nextOffset,
      fetched_count: (job.fetched_count ?? 0) + Math.max(fetched, 0),
      consecutive_errors: 0,
      last_error: null,
      last_success_at: new Date().toISOString(),
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", job.id);

    return json({ success: true, job_id: job.id, source_key: job.source_key, fetched, next_offset: nextOffset, completed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job) {
      await supabase.from("backfill_jobs").update({
        state: "paused",
        lease_until: null,
        last_error: message.slice(0, 2000),
        consecutive_errors: (job.consecutive_errors ?? 0) + 1,
      }).eq("id", job.id);
    }
    console.error("backfill-runner error", message);
    return json({ success: false, paused: Boolean(job), error: "Backfill runner failed." }, 500);
  } finally {
    const { error } = await supabase.rpc("release_backfill_runner_lock", { p_holder: holder });
    if (error) console.error("backfill-runner lock release failed", error.message);
  }
});
