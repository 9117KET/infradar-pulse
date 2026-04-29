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

  const lastUpdated = input.lastUpdated ? new Date(input.lastUpdated).getTime() : Date.now();
  const ageDays = Math.max(0, Math.floor((Date.now() - lastUpdated) / 86_400_000));
  let freshnessScore = 100;
  if (ageDays > 180) {
    freshnessScore = 20;
    flags.push('stale_record');
  } else if (ageDays > 90) freshnessScore = 45;
  else if (ageDays > 30) freshnessScore = 70;

  const confidenceScore = clamp(input.confidence ?? 0);
  let totalScore = Math.round(
    sourceScore * 0.3 + evidenceScore * 0.25 + completenessScore * 0.2 + freshnessScore * 0.1 + confidenceScore * 0.15,
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
