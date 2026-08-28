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
  totalScore: number;
  sourceScore: number;
  evidenceScore: number;
  completenessScore: number;
  freshnessScore: number;
  confidenceScore: number;
  missingFields: string[];
  flags: string[];
  recommendation: 'approve' | 'review' | 'needs_research';
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

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
/** Mirrors QUALITY_WEIGHTS in _shared/intelligenceQuality.ts. */
export const QUALITY_WEIGHTS = {
  source: 0.30,
  evidence: 0.25,
  freshness: 0.22,
  completeness: 0.13,
  confidence: 0.10,
} as const;

/** Mirrors UNKNOWN_FRESHNESS_SCORE in _shared/intelligenceQuality.ts. */
const UNKNOWN_FRESHNESS_SCORE = 45;

/** Mirrors FUTURE_TOLERANCE_MS in _shared/intelligenceQuality.ts. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function isValidEvidenceUrl(url?: string | null) {
  const value = (url ?? '').trim();
  return value.startsWith('http') && value !== '#';
}

export function calculateIntelligenceQuality(input: QualityInput): QualityScoreBreakdown {
  const missingFields: string[] = [];
  const flags: string[] = [];
  let sourceScore = 0;
  let evidenceScore = 0;
  let completenessScore = 0;

  if (isValidEvidenceUrl(input.sourceUrl)) {
    sourceScore = 45;
  } else {
    missingFields.push('source_url');
    flags.push('missing_source_url');
  }

  if ((input.officialSourceCount ?? 0) > 0) sourceScore = clamp(sourceScore + 35);

  const evidenceCount = input.evidenceCount ?? 0;
  if (evidenceCount >= 2) evidenceScore = 100;
  else if (evidenceCount === 1) evidenceScore = 55;
  else missingFields.push('evidence');

  if ((input.description ?? '').trim().length >= 80) completenessScore += 25;
  else missingFields.push('description');

  if ((input.valueUsd ?? 0) > 0) completenessScore += 20;
  else missingFields.push('value');

  if ((input.contactCount ?? 0) > 0) completenessScore += 25;
  else missingFields.push('contact');

  if (typeof input.lat === 'number' && typeof input.lng === 'number' && !(input.lat === 0 && input.lng === 0)) {
    completenessScore += 30;
  } else {
    missingFields.push('coordinates');
    flags.push('weak_geospatial_precision');
  }

  // Must stay behaviourally identical to
  // supabase/functions/_shared/intelligenceQuality.ts - the two copies exist
  // because the Deno edge runtime and the Vite client cannot share a module
  // across the tsconfig boundary. src/lib/intelligence-quality.parity.test.ts
  // runs both over the same fixtures and fails if they diverge.
  //
  // Every path that cannot establish a real age fails toward "unknown", never
  // toward "fresh": a missing date, an unparseable one, and a future one all
  // land on UNKNOWN_FRESHNESS_SCORE and raise a flag.
  const lastUpdatedMs = input.lastUpdated ? new Date(input.lastUpdated).getTime() : NaN;
  let freshnessScore: number;

  if (!Number.isFinite(lastUpdatedMs)) {
    freshnessScore = UNKNOWN_FRESHNESS_SCORE;
    flags.push(input.lastUpdated ? 'unparseable_last_updated' : 'unknown_freshness');
  } else if (lastUpdatedMs > Date.now() + FUTURE_TOLERANCE_MS) {
    freshnessScore = UNKNOWN_FRESHNESS_SCORE;
    flags.push('future_last_updated');
  } else {
    const ageDays = Math.max(0, Math.floor((Date.now() - lastUpdatedMs) / 86_400_000));
    freshnessScore = 100;
    if (ageDays > 180) {
      freshnessScore = 20;
      flags.push('stale_record');
    } else if (ageDays > 90) freshnessScore = 45;
    else if (ageDays > 30) freshnessScore = 70;
  }

  const confidenceScore = clamp(input.confidence ?? 0);
  let totalScore = Math.round(
    sourceScore * QUALITY_WEIGHTS.source +
    evidenceScore * QUALITY_WEIGHTS.evidence +
    completenessScore * QUALITY_WEIGHTS.completeness +
    freshnessScore * QUALITY_WEIGHTS.freshness +
    confidenceScore * QUALITY_WEIGHTS.confidence,
  );

  if (!isValidEvidenceUrl(input.sourceUrl)) totalScore = Math.min(totalScore, 30);

  const recommendation: QualityScoreBreakdown['recommendation'] =
    totalScore >= 85 && evidenceCount >= 2 && (input.officialSourceCount ?? 0) > 0
      ? 'approve'
      : totalScore >= 50
        ? 'review'
        : 'needs_research';

  return {
    totalScore,
    sourceScore,
    evidenceScore,
    completenessScore,
    freshnessScore,
    confidenceScore,
    missingFields,
    flags,
    recommendation,
  };
}
