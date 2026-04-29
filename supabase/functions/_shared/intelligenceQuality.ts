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

  const lastUpdated = input.lastUpdated ? new Date(input.lastUpdated).getTime() : Date.now();
  const ageDays = Math.max(0, Math.floor((Date.now() - lastUpdated) / 86_400_000));
  let freshness_score = 100;
  if (ageDays > 180) {
    freshness_score = 20;
    flags.push('stale_record');
  } else if (ageDays > 90) freshness_score = 45;
  else if (ageDays > 30) freshness_score = 70;

  const confidence_score = clamp(input.confidence ?? 0);
  let total_score = Math.round(source_score * 0.3 + evidence_score * 0.25 + completeness_score * 0.2 + freshness_score * 0.1 + confidence_score * 0.15);
  if (!isValidEvidenceUrl(input.sourceUrl)) total_score = Math.min(total_score, 30);

  const recommendation = total_score >= 85 && evidenceCount >= 2 && (input.officialSourceCount ?? 0) > 0
    ? 'approve'
    : total_score >= 50
      ? 'review'
      : 'needs_research';

  return { total_score, source_score, evidence_score, completeness_score, freshness_score, confidence_score, missing_fields, flags, recommendation };
}
