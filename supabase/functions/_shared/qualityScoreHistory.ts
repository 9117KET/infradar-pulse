/**
 * Writes to the quality_scores history table.
 *
 * quality_scores is an append-only history, and its indexes say so:
 *   (project_id, calculated_at DESC) and (candidate_id, calculated_at DESC)
 * are exactly the shape of a "latest score for this entity" lookup. The table
 * was designed deliberately; only its reader was never written.
 *
 * The problem is what was being appended. Every staged project and every
 * enrichment pass wrote a new row unconditionally, so the table recorded a
 * history of RUNS rather than a history of CHANGES. Under the hourly backfill
 * jobs - five sources at 500 records a run - an unchanged record accumulated a
 * fresh identical row every hour, forever, in a table nothing reads.
 *
 * This writes only when the score actually differs from the latest stored one.
 * Once a source exhausts its cursor and the backfill becomes a rolling refresh,
 * the steady state is a cheap indexed SELECT and no write at all.
 *
 * Nothing about the schema, the indexes or the history semantics changes - a
 * reader added later still gets the same answer from the same query, just
 * without the duplicate rows in between.
 */

import type { QualityScoreBreakdown } from "./intelligenceQuality.ts";

type SupabaseAdmin = any;

/** The stored shape, as selected back from quality_scores. */
export interface StoredQualityScore {
  total_score: number | null;
  source_score: number | null;
  evidence_score: number | null;
  completeness_score: number | null;
  freshness_score: number | null;
  confidence_score: number | null;
  missing_fields: string[] | null;
  flags: string[] | null;
  recommendation: string | null;
}

const sameSet = (a?: string[] | null, b?: string[] | null) => {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/**
 * True when a freshly computed score is materially identical to the stored one.
 *
 * Compares the assessment only - never calculated_at. Two runs an hour apart
 * that reach the same conclusion are the same assessment, and recording both
 * tells a future reader nothing it did not already know.
 *
 * Order-insensitive on flags and missing_fields: those are emitted in scorer
 * order, and a reordering is not a change in meaning.
 */
export function isSameQualityScore(
  previous: StoredQualityScore | null | undefined,
  next: QualityScoreBreakdown,
): boolean {
  if (!previous) return false;
  return (
    previous.total_score === next.total_score &&
    previous.source_score === next.source_score &&
    previous.evidence_score === next.evidence_score &&
    previous.completeness_score === next.completeness_score &&
    previous.freshness_score === next.freshness_score &&
    previous.confidence_score === next.confidence_score &&
    previous.recommendation === next.recommendation &&
    sameSet(previous.missing_fields, next.missing_fields) &&
    sameSet(previous.flags, next.flags)
  );
}

const COLUMNS =
  "total_score, source_score, evidence_score, completeness_score, " +
  "freshness_score, confidence_score, missing_fields, flags, recommendation";

/**
 * Appends a quality score, unless it repeats the latest stored assessment.
 *
 * Exactly one of projectId / candidateId should be set, matching the two
 * indexes on the table. Returns what it did, so callers can log or count.
 *
 * Failures are swallowed and reported as "failed": this is an audit trail, and
 * losing a history row must never abort an ingest that otherwise succeeded.
 */
export async function recordQualityScore(
  supabase: SupabaseAdmin,
  opts: {
    projectId?: string | null;
    candidateId?: string | null;
    quality: QualityScoreBreakdown;
    details?: Record<string, unknown>;
  },
): Promise<"inserted" | "unchanged" | "failed"> {
  const { projectId, candidateId, quality, details } = opts;
  const keyColumn = projectId ? "project_id" : "candidate_id";
  const keyValue = projectId ?? candidateId;
  if (!keyValue) return "failed";

  try {
    // Served by idx_quality_scores_project / _candidate.
    const { data: previous, error: readError } = await supabase
      .from("quality_scores")
      .select(COLUMNS)
      .eq(keyColumn, keyValue)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // On a read failure fall through and insert: a duplicate row is a much
    // smaller problem than a silently dropped assessment.
    if (!readError && isSameQualityScore(previous as StoredQualityScore | null, quality)) {
      return "unchanged";
    }

    const { error: writeError } = await supabase.from("quality_scores").insert({
      [keyColumn]: keyValue,
      total_score: quality.total_score,
      source_score: quality.source_score,
      evidence_score: quality.evidence_score,
      completeness_score: quality.completeness_score,
      freshness_score: quality.freshness_score,
      confidence_score: quality.confidence_score,
      missing_fields: quality.missing_fields,
      flags: quality.flags,
      recommendation: quality.recommendation,
      ...(details ? { details } : {}),
    });
    if (writeError) {
      console.error(`quality_scores insert failed for ${keyColumn}=${keyValue}:`, writeError.message ?? writeError);
      return "failed";
    }
    return "inserted";
  } catch (error) {
    console.error(
      `quality_scores write errored for ${keyColumn}=${keyValue}:`,
      error instanceof Error ? error.message : String(error),
    );
    return "failed";
  }
}
