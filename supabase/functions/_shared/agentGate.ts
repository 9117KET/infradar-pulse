 /**
 * agentGate.ts
 *
 * Shared utility for checking whether an agent is currently enabled.
 * Call this at the start of any edge function to respect the pause/resume
 * state set from the Agent Monitoring dashboard.
 *
 * Usage:
 *   import { isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";
 *
 *   const enabled = await isAgentEnabled(supabase, "discovery");
 *   if (!enabled) return pausedResponse();
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
