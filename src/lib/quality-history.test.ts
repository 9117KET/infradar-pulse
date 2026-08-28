/**
 * Tests for quality_scores write suppression (finding 01, write-amplification).
 *
 * quality_scores is an append-only history table, indexed on
 * (project_id, calculated_at DESC) and (candidate_id, calculated_at DESC) —
 * the shape of a "latest score for this entity" lookup. The design is sound;
 * what was wrong is that every ingest and enrichment appended a row
 * unconditionally, so it recorded a history of RUNS rather than of CHANGES.
 * Under hourly backfills an unchanged record gained an identical row every
 * hour, forever, in a table nothing reads.
 */
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - outside the app tsconfig's `include`; resolved by Vite at runtime.
import { isSameQualityScore } from '../../supabase/functions/_shared/qualityScoreHistory.ts';

const stored = {
  total_score: 78,
  source_score: 80,
  evidence_score: 55,
  completeness_score: 75,
  freshness_score: 100,
  confidence_score: 85,
  missing_fields: ['contact'],
  flags: [],
  recommendation: 'review',
};

/** The same assessment as `stored`, in the scorer's own shape. */
const computed = {
  total_score: 78,
  source_score: 80,
  evidence_score: 55,
  completeness_score: 75,
  freshness_score: 100,
  confidence_score: 85,
  missing_fields: ['contact'],
  flags: [] as string[],
  recommendation: 'review' as const,
};

describe('suppresses repeat assessments', () => {
  it('treats an identical score as unchanged', () => {
    expect(isSameQualityScore(stored, computed)).toBe(true);
  });

  it('ignores ordering within flags and missing_fields', () => {
    // The scorer emits these in its own order; a reordering is not a change
    // in meaning and must not cost a duplicate row.
    const a = { ...stored, flags: ['stale_record', 'weak_geospatial_precision'], missing_fields: ['contact', 'evidence'] };
    const b = { ...computed, flags: ['weak_geospatial_precision', 'stale_record'], missing_fields: ['evidence', 'contact'] };
    expect(isSameQualityScore(a, b)).toBe(true);
  });

  it('always writes when there is no previous row', () => {
    expect(isSameQualityScore(null, computed)).toBe(false);
    expect(isSameQualityScore(undefined, computed)).toBe(false);
  });
});

describe('still records real changes', () => {
  it.each([
    ['total_score', { total_score: 79 }],
    ['source_score', { source_score: 45 }],
    ['evidence_score', { evidence_score: 100 }],
    ['completeness_score', { completeness_score: 100 }],
    ['freshness_score', { freshness_score: 70 }],
    ['confidence_score', { confidence_score: 90 }],
    ['recommendation', { recommendation: 'approve' }],
  ])('detects a change in %s', (_label, patch) => {
    expect(isSameQualityScore(stored, { ...computed, ...patch })).toBe(false);
  });

  it('detects a newly raised flag', () => {
    // The case that matters most: a record going stale must be recorded, not
    // suppressed, even if every numeric component happened to be unchanged.
    expect(isSameQualityScore(stored, { ...computed, flags: ['stale_record'] })).toBe(false);
  });

  it('detects a flag being cleared', () => {
    const withFlag = { ...stored, flags: ['stale_record'] };
    expect(isSameQualityScore(withFlag, computed)).toBe(false);
  });

  it('detects a change in missing_fields', () => {
    expect(isSameQualityScore(stored, { ...computed, missing_fields: [] })).toBe(false);
  });

  it('treats null stored arrays as empty rather than as a difference', () => {
    const nullArrays = { ...stored, flags: null, missing_fields: null };
    expect(isSameQualityScore(nullArrays, { ...computed, flags: [], missing_fields: [] })).toBe(true);
  });
});

describe('the freshness fix and write suppression interact correctly', () => {
  it('records the transition when a record crosses into stale', () => {
    // Before the freshness fix this could never happen: freshness_score was a
    // constant 100, so a record ageing past 180 days produced a byte-identical
    // assessment and would now be suppressed. The two changes only compose
    // safely because freshness actually moves.
    const fresh = { ...stored, freshness_score: 100, flags: [] };
    const stale = { ...computed, freshness_score: 20, flags: ['stale_record'], total_score: 60 };
    expect(isSameQualityScore(fresh, stale)).toBe(false);
  });
});
