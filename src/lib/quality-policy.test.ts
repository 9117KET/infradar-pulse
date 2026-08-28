/**
 * Policy tests for quality weighting and the auto-publish gate.
 *
 * Covers three findings from the data-integrity review:
 *   03  freshness was weighted 0.10, the lowest of five components, in a
 *       product whose value proposition is currency of information
 *   04  AUTO_PUBLISH_MIN_QUALITY (60) sat below the scorer's own 'approve'
 *       line (85) with nothing reconciling them
 *   06  the scorer raised flags that nothing anywhere consumed
 */
import { describe, it, expect } from 'vitest';
import { calculateIntelligenceQuality, QUALITY_WEIGHTS } from './intelligence-quality';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - outside the app tsconfig's `include`; resolved by Vite at runtime.
import { AUTO_PUBLISH_BLOCKING_FLAGS } from '../../supabase/functions/_shared/pipelineIngest.ts';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const officialRegistryRecord = {
  sourceUrl: 'https://projects.worldbank.org/p/P123456',
  confidence: 85,
  description: 'x'.repeat(120),
  valueUsd: 1_310_000_000,
  lat: 14.9,
  lng: 1.05,
  evidenceCount: 1,
  officialSourceCount: 1,
};

describe('finding 03 — component weights', () => {
  it('sums to exactly 1', () => {
    const sum = Object.values(QUALITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('no longer ranks freshness last', () => {
    const others = [
      QUALITY_WEIGHTS.completeness,
      QUALITY_WEIGHTS.confidence,
    ];
    // It was 0.10, below every other component. It must now outweigh at least
    // the two weakest trust signals it was funded from.
    for (const w of others) expect(QUALITY_WEIGHTS.freshness).toBeGreaterThan(w);
  });

  it('keeps provenance as the single heaviest signal', () => {
    for (const [k, w] of Object.entries(QUALITY_WEIGHTS)) {
      if (k !== 'source') expect(QUALITY_WEIGHTS.source).toBeGreaterThanOrEqual(w);
    }
  });

  it('makes age move the total score materially', () => {
    const fresh = calculateIntelligenceQuality({ ...officialRegistryRecord, lastUpdated: daysAgo(1) });
    const stale = calculateIntelligenceQuality({ ...officialRegistryRecord, lastUpdated: daysAgo(400) });
    // 80 points of freshness swing x 0.22 => ~18 points of total score.
    expect(fresh.totalScore - stale.totalScore).toBeGreaterThanOrEqual(15);
  });

  it('does not upend auto-publish for a healthy fresh record', () => {
    // Guards against a reweight that silently stalls the ingest pipeline by
    // pushing ordinary official-registry rows under the promotion floor.
    const q = calculateIntelligenceQuality({ ...officialRegistryRecord, lastUpdated: daysAgo(2) });
    expect(q.totalScore).toBeGreaterThanOrEqual(60);
  });
});

describe('finding 06 — flags have a consumer', () => {
  it('blocks on faults the scorer can actually raise', () => {
    // A blocking flag the scorer never emits would be dead configuration.
    const producible = new Set<string>();
    for (const lastUpdated of [daysAgo(400), 'not a date', daysAgo(-500), null]) {
      calculateIntelligenceQuality({ ...officialRegistryRecord, lastUpdated })
        .flags.forEach((f) => producible.add(f));
    }
    for (const flag of AUTO_PUBLISH_BLOCKING_FLAGS) {
      expect(producible).toContain(flag);
    }
  });

  it('blocks provably-bad ages', () => {
    expect(AUTO_PUBLISH_BLOCKING_FLAGS).toContain('stale_record');
    expect(AUTO_PUBLISH_BLOCKING_FLAGS).toContain('unparseable_last_updated');
    expect(AUTO_PUBLISH_BLOCKING_FLAGS).toContain('future_last_updated');
  });

  it('does NOT block merely-unknown ages', () => {
    // A missing published date is an upstream feed limitation, not a defect in
    // the record. Blocking on it would divert a large share of legitimate
    // official-registry rows into human review.
    expect(AUTO_PUBLISH_BLOCKING_FLAGS).not.toContain('unknown_freshness');
  });
});

describe('finding 04 — score alone was not enough', () => {
  it('a stale record still clears the score floor, so the flag must stop it', () => {
    const stale = calculateIntelligenceQuality({ ...officialRegistryRecord, lastUpdated: daysAgo(400) });

    // This is the crux: raising the weight was not sufficient on its own.
    // A stale official-registry record still scores at or above the promotion
    // floor, so without the flag gate it would auto-publish a figure we
    // already know is out of date.
    expect(stale.totalScore).toBeGreaterThanOrEqual(60);
    expect(stale.flags).toContain('stale_record');

    const blocked = stale.flags.some((f) =>
      (AUTO_PUBLISH_BLOCKING_FLAGS as readonly string[]).includes(f));
    expect(blocked).toBe(true);
  });

  it('lets a fresh record through unblocked', () => {
    const fresh = calculateIntelligenceQuality({ ...officialRegistryRecord, lastUpdated: daysAgo(2) });
    const blocked = fresh.flags.some((f) =>
      (AUTO_PUBLISH_BLOCKING_FLAGS as readonly string[]).includes(f));
    expect(blocked).toBe(false);
  });

  it('keeps the promotion floor below the general approve line, deliberately', () => {
    // The two thresholds answer different questions and are documented as such
    // in pipelineIngest.ts. This pins the relationship so a future edit that
    // collapses them is a conscious decision rather than a silent one.
    const strong = calculateIntelligenceQuality({
      ...officialRegistryRecord, evidenceCount: 2, contactCount: 1,
      confidence: 95, lastUpdated: daysAgo(1),
    });
    expect(strong.recommendation).toBe('approve');
    expect(strong.totalScore).toBeGreaterThanOrEqual(85);
  });
});
