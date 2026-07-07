/**
 * Offset cursors for automated ingest backfill.
 *
 * Deterministic ingest agents accept `mode: "backfill"` in the request body:
 * the run starts from the persisted `next_offset` for its cursor key and
 * advances it afterwards. When a run comes back short (fewer rows than
 * requested) the dataset is exhausted — the cursor records `exhausted_at` and
 * resets to 0 so subsequent backfill runs become rolling freshness re-pulls.
 *
 * Cursor keys are per agent, with a per-status suffix where the upstream API
 * paginates per status (e.g. "world-bank-ingest:Active").
 */

type SupabaseAdmin = any;

export interface IngestCursor {
  nextOffset: number;
  exhaustedAt: string | null;
}

export async function getIngestCursor(supabase: SupabaseAdmin, agentKey: string): Promise<IngestCursor> {
  const { data, error } = await supabase
    .from("ingest_cursors")
    .select("next_offset, exhausted_at")
    .eq("agent_key", agentKey)
    .maybeSingle();
  if (error) throw error;
  return { nextOffset: data?.next_offset ?? 0, exhaustedAt: data?.exhausted_at ?? null };
}

export async function saveIngestCursor(
  supabase: SupabaseAdmin,
  agentKey: string,
  opts: { nextOffset: number; exhausted: boolean },
): Promise<void> {
  const { error } = await supabase.from("ingest_cursors").upsert({
    agent_key: agentKey,
    // Exhausted datasets restart from 0 so backfill cron doubles as refresh.
    next_offset: opts.exhausted ? 0 : opts.nextOffset,
    exhausted_at: opts.exhausted ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "agent_key" });
  if (error) throw error;
}
