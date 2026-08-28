export interface QualityInput {
  sourceUrl?: string | null;
  confidence?: number | null;
  description?: string | null;
  valueUsd?: number | null;
  lat?: number | null;
  lng?: number | null;
  evidenceCount?: number;
  officialSourceCount?: number;
  contactCount?: number;
  lastUpdated?: string | null;
}

export interface QualityScoreBreakdown {
  total_score: number;
  source_score: number;
  evidence_score: number;
  completeness_score: number;
  freshness_score: number;
  confidence_score: number;
  missing_fields: string[];
  flags: string[];
  recommendation: 'approve' | 'review' | 'needs_research';
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/**
 * Score used when a record's age cannot be established. Deliberately equal to
 * the ">90 days old" tier: an unknown age must not outrank a known-recent
 * record, but is not as damning as a known-ancient one. Tune here, once.
 */
/**
 * Component weights. Must sum to 1.
 *
 * Rationale for the split, so the next person to touch it knows what was
 * traded against what:
 *   source       what published it - the strongest single trust signal
 *   evidence     corroboration across documents
 *   freshness    whether the record is still TRUE. For live infrastructure
 *                pipelines this is nearly as load-bearing as provenance:
 *                a perfectly sourced, well-evidenced capital figure from
 *                2024 is not a usable citation in 2026.
 *   completeness how many fields are filled - a proxy for effort, not truth.
 *                A sparse correct record beats a complete stale one.
 *   confidence   the extractor's own self-report, and therefore the least
 *                independent signal in the set.
 *
 * Freshness was 0.10 - the lowest of the five - in a product whose value
 * proposition is currency of information. It was funded up to 0.22 out of
 * completeness and confidence, the two weakest trust signals.
 */
export const QUALITY_WEIGHTS = {
  source: 0.30,
  evidence: 0.25,
  freshness: 0.22,
  completeness: 0.13,
  confidence: 0.10,
} as const;

/** Score used when a record's age cannot be established (the ">90 days" tier). */
const UNKNOWN_FRESHNESS_SCORE = 45;

/** Clock skew allowance before a future timestamp is treated as a data error. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function isValidEvidenceUrl(url?: string | null) {
  const value = (url ?? '').trim();
  return value.startsWith('http') && value !== '#';
}

export function calculateIntelligenceQuality(input: QualityInput): QualityScoreBreakdown {
  const missing_fields: string[] = [];
  const flags: string[] = [];
  let source_score = 0;
  let evidence_score = 0;
  let completeness_score = 0;

  if (isValidEvidenceUrl(input.sourceUrl)) source_score = 45;
  else {
    missing_fields.push('source_url');
    flags.push('missing_source_url');
  }

  if ((input.officialSourceCount ?? 0) > 0) source_score = clamp(source_score + 35);

  const evidenceCount = input.evidenceCount ?? 0;
  if (evidenceCount >= 2) evidence_score = 100;
  else if (evidenceCount === 1) evidence_score = 55;
  else missing_fields.push('evidence');

  if ((input.description ?? '').trim().length >= 80) completeness_score += 25;
  else missing_fields.push('description');

  if ((input.valueUsd ?? 0) > 0) completeness_score += 20;
  else missing_fields.push('value');

  if ((input.contactCount ?? 0) > 0) completeness_score += 25;
  else missing_fields.push('contact');

  if (typeof input.lat === 'number' && typeof input.lng === 'number' && !(input.lat === 0 && input.lng === 0)) completeness_score += 30;
  else {
    missing_fields.push('coordinates');
    flags.push('weak_geospatial_precision');
  }

  // Freshness is the only component that changes without anyone touching the
  // record, so every path that cannot establish a real age must fail toward
  // "unknown", never toward "fresh". Three paths previously scored a full 100:
  // a missing lastUpdated (defaulted to Date.now()), an unparseable date
  // (NaN, which fails every > comparison below), and a future date (clamped to
  // age 0). All three now land on UNKNOWN_FRESHNESS_SCORE and raise a flag.
  const lastUpdatedMs = input.lastUpdated ? new Date(input.lastUpdated).getTime() : NaN;
  let freshness_score: number;

  if (!Number.isFinite(lastUpdatedMs)) {
    freshness_score = UNKNOWN_FRESHNESS_SCORE;
    flags.push(input.lastUpdated ? 'unparseable_last_updated' : 'unknown_freshness');
  } else if (lastUpdatedMs > Date.now() + FUTURE_TOLERANCE_MS) {
    // A record that claims to be updated in the future is a source or parsing
    // bug. Treat it as unknown rather than rewarding it with a perfect score.
    freshness_score = UNKNOWN_FRESHNESS_SCORE;
    flags.push('future_last_updated');
  } else {
    const ageDays = Math.max(0, Math.floor((Date.now() - lastUpdatedMs) / 86_400_000));
    freshness_score = 100;
    if (ageDays > 180) {
      freshness_score = 20;
      flags.push('stale_record');
    } else if (ageDays > 90) freshness_score = 45;
    else if (ageDays > 30) freshness_score = 70;
  }

  const confidence_score = clamp(input.confidence ?? 0);
  let total_score = Math.round(
    source_score * QUALITY_WEIGHTS.source +
    evidence_score * QUALITY_WEIGHTS.evidence +
    completeness_score * QUALITY_WEIGHTS.completeness +
    freshness_score * QUALITY_WEIGHTS.freshness +
    confidence_score * QUALITY_WEIGHTS.confidence,
  );
  if (!isValidEvidenceUrl(input.sourceUrl)) total_score = Math.min(total_score, 30);

  const recommendation = total_score >= 85 && evidenceCount >= 2 && (input.officialSourceCount ?? 0) > 0
    ? 'approve'
    : total_score >= 50
      ? 'review'
      : 'needs_research';

  return { total_score, source_score, evidence_score, completeness_score, freshness_score, confidence_score, missing_fields, flags, recommendation };
}
