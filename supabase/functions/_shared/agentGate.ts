/**
 * agentGate.ts
 *
 * Shared utilities for agent lifecycle management:
 *   - isAgentEnabled / pausedResponse  : pause/resume gate
 *   - beginAgentTask                   : atomic concurrency lock + task insert
 *   - alreadyRunningResponse           : standard 200 response when skipping
 *
 * Usage:
 *   import { isAgentEnabled, pausedResponse, beginAgentTask, alreadyRunningResponse } from "../_shared/agentGate.ts";
 *
 *   if (!await isAgentEnabled(supabase, "discovery")) return pausedResponse("discovery");
 *   const lock = await beginAgentTask(supabase, "discovery", "Full pipeline run", userId);
 *   if (lock.alreadyRunning) return alreadyRunningResponse("discovery");
 *   const taskId = lock.taskId;
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Returns true if the agent should run, false if it is paused.
 * If no config row exists the agent is considered enabled (safe default).
 * Errors in the lookup are swallowed so a missing table never blocks an agent.
 */
export async function isAgentEnabled(
  supabase: SupabaseClient,
  agentType: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("agent_config")
      .select("enabled")
      .eq("agent_type", agentType)
      .maybeSingle();
    if (data === null) return true; // no row → default enabled
    return data.enabled !== false;
  } catch {
    return true; // never block an agent due to config lookup failure
  }
}

/**
 * Standard 200 response to return when an agent is paused.
 * Returns { success: true, paused: true } so callers know it was intentional.
 */
export function pausedResponse(agentType?: string): Response {
  return new Response(
    JSON.stringify({ success: true, paused: true, message: `Agent${agentType ? ` "${agentType}"` : ""} is currently paused` }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Atomically check whether another instance of the agent is already running
 * and, if not, insert a new 'running' task row.
 *
 * Uses the begin_agent_task DB function so the check+insert is a single
 * transaction with no race window.
 *
 * Returns:
 *   { alreadyRunning: true }               - another instance is live; return alreadyRunningResponse()
 *   { alreadyRunning: false, taskId: string } - new task created; proceed with taskId
 */
export async function beginAgentTask(
  supabase: SupabaseClient,
  taskType: string,
  query: string,
  requestedBy?: string,
): Promise<{ alreadyRunning: true } | { alreadyRunning: false; taskId: string }> {
  try {
    const { data, error } = await supabase.rpc("begin_agent_task", {
      p_task_type: taskType,
      p_query: query,
      p_requested_by: requestedBy ?? null,
    });
    if (error) throw error;
    if (data?.already_running) return { alreadyRunning: true };
    return { alreadyRunning: false, taskId: data.id as string };
  } catch (e) {
    // Fallback: if the RPC is unavailable, insert directly (no lock).
    console.warn("begin_agent_task RPC failed, falling back to direct insert:", e);
    const { data: task } = await supabase
      .from("research_tasks")
      .insert({
        task_type: taskType,
        query,
        status: "running",
        requested_by: requestedBy && requestedBy !== "service_role" ? requestedBy : null,
      })
      .select("id")
      .single();
    return { alreadyRunning: false, taskId: task?.id ?? "unknown" };
  }
}

/**
 * Update the current_step on an in-progress task row.
 * Errors are swallowed so a failed step update never crashes the agent.
 *
 * Steps are free-form strings. Conventional values used across agents:
 *   "Searching"  - building research context with Lovable AI or approved optional connectors
 *   "Extracting" - AI extraction / parsing raw content
 *   "Analyzing"  - scoring, deduplication, enrichment logic
 *   "Saving"     - writing results to the database
 */
export async function setTaskStep(
  supabase: SupabaseClient,
  taskId: string,
  step: string,
): Promise<void> {
  try {
    await supabase
      .from("research_tasks")
      .update({ current_step: step })
      .eq("id", taskId);
  } catch { /* best-effort — never crash on a step update */ }
}

/**
 * Record the outcome of an agent run into agent_config summary stats.
 * Call this after the final research_tasks update (completed/failed).
 * Errors are swallowed — never let a stats update crash the agent.
 *
 * @param supabase      Service-role Supabase client
 * @param agentType     The agent_type key (matches agent_config.agent_type)
 * @param status        'completed' | 'failed'
 * @param startedAt     Date the run began (from beginAgentTask) — used to compute duration
 */
export async function finishAgentRun(
  supabase: SupabaseClient,
  agentType: string,
  status: "completed" | "failed",
  startedAt: Date,
): Promise<void> {
  try {
    const durationMs = Date.now() - startedAt.getTime();
    await supabase.rpc("finish_agent_run", {
      p_agent_type: agentType,
      p_status: status,
      p_duration_ms: durationMs,
    });
  } catch { /* best-effort */ }
}

export async function recordAgentEvent(
  supabase: SupabaseClient,
  agentType: string,
  eventType: string,
  message = "",
  taskId?: string | null,
  counters: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("agent_run_events").insert({
      task_id: taskId ?? null,
      agent_type: agentType,
      event_type: eventType,
      message,
      counters,
      metadata,
    });
  } catch { /* best-effort */ }
}

/**
 * Best-effort: mark an in-progress task row as failed and update agent_config stats.
 * Use inside top-level catch blocks so a thrown error never leaves a "running" lock behind.
 * All failures are swallowed — never throw from cleanup.
 */
export async function failAgentTask(
  supabase: SupabaseClient,
  agentType: string,
  taskId: string | undefined | null,
  startedAt: Date,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  try {
    if (taskId) {
      await supabase
        .from("research_tasks")
        .update({ status: "failed", error: message.slice(0, 2000), completed_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("status", "running");
    }
  } catch { /* best-effort */ }
  try {
    await finishAgentRun(supabase, agentType, "failed", startedAt);
  } catch { /* best-effort */ }
}

/**
 * Standard 200 response to return when an agent is already running.
 * Returns { success: true, skipped: true } so callers know it was intentional.
 */
export function alreadyRunningResponse(agentType?: string): Response {
  return new Response(
    JSON.stringify({
      success: true,
      skipped: true,
      message: `Agent${agentType ? ` "${agentType}"` : ""} is already running`,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
