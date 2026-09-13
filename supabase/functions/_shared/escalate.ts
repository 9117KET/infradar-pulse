// Shared guardrail: any automated step that cannot safely decide on its own
// records the situation for a human instead of guessing or failing silently.
// Items surface in the Review Queue under "Needs a human".

export type EscalationSeverity = "low" | "medium" | "high" | "critical";

export interface EscalateOptions {
  process: string;
  reasonCode: string;
  detail: string;
  severity?: EscalationSeverity;
  subjectType?: string | null;
  subjectId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Records an escalation. Deduplicates on (process, reason_code, subject) in the
 * database, so calling it repeatedly for the same situation bumps a counter
 * rather than flooding the queue. Never throws: a failure to escalate must not
 * take down the agent that is reporting a problem.
 */
export async function escalateToHuman(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  options: EscalateOptions,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("escalate_to_human", {
      p_process: options.process,
      p_reason_code: options.reasonCode,
      p_detail: options.detail.slice(0, 2000),
      p_severity: options.severity ?? "medium",
      p_subject_type: options.subjectType ?? null,
      p_subject_id: options.subjectId ?? null,
      p_project_id: options.projectId ?? null,
      p_metadata: options.metadata ?? {},
    });
    if (error) {
      console.error("escalate_to_human failed", options.process, options.reasonCode, error.message);
      return null;
    }
    return (data as string) ?? null;
  } catch (err) {
    console.error("escalate_to_human threw", options.process, options.reasonCode, String(err));
    return null;
  }
}
