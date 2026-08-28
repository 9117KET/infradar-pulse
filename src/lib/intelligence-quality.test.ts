/**
 * Freshness scoring regression tests.
 *
 * The bug these lock down: freshness_score was effectively a constant 100 in
 * production. Both edge call sites passed `lastUpdated: new Date()`, and the
 * scorer itself defaulted a missing date to `Date.now()`, so the ageDays tiers
 * were unreachable and `stale_record` could never be raised from the ingest
 * path. Freshness stopped being a signal and became a fixed 10-point offset on
 * every score in the database.
 *
 * The rule now: any path that cannot establish a real age must fail toward
 * "unknown", never toward "fresh".
 */
import { describe, it, expect } from 'vitest';
import { calculateIntelligenceQuality } from './intelligence-quality';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** A record that is strong on every axis except the one under test. */
const solid = {
  sourceUrl: 'https://projects.worldbank.org/en/projects-operations/project-detail/P123456',
  confidence: 90,
  description: 'x'.repeat(120),
  valueUsd: 1_310_000_000,
  lat: 14.9,
  lng: 1.05,
  evidenceCount: 2,
  officialSourceCount: 1,
  contactCount: 1,
};

describe('freshness tiers', () => {
  it('scores a record updated today as fully fresh', () => {
    const q = calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(0) });
    expect(q.freshnessScore).toBe(100);
    expect(q.flags).not.toContain('stale_record');
  });

  it.each([
    [15, 100],
    [45, 70],
    [120, 45],
    [365, 20],
  ])('scores a record %i days old at %i', (age, expected) => {
    expect(calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(age) }).freshnessScore)
      .toBe(expected);
  });

  it('raises stale_record past 180 days', () => {
    expect(calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(200) }).flags)
      .toContain('stale_record');
  });

  it('does not raise stale_record just under the boundary', () => {
    expect(calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(179) }).flags)
      .not.toContain('stale_record');
  });
});

describe('unknown age must not score as fresh', () => {
  it('does not award 100 when lastUpdated is missing', () => {
    const q = calculateIntelligenceQuality({ ...solid, lastUpdated: null });
    expect(q.freshnessScore).toBeLessThan(100);
    expect(q.flags).toContain('unknown_freshness');
  });

  it('does not award 100 when lastUpdated is undefined', () => {
    const q = calculateIntelligenceQuality({ ...solid });
    expect(q.freshnessScore).toBeLessThan(100);
    expect(q.flags).toContain('unknown_freshness');
  });

  it('does not award 100 for an unparseable date', () => {
    // Previously: new Date('last tuesday').getTime() is NaN, every `ageDays >`
    // comparison is false, and the score silently stayed at 100.
    const q = calculateIntelligenceQuality({ ...solid, lastUpdated: 'last tuesday' });
    expect(q.freshnessScore).toBeLessThan(100);
    expect(q.flags).toContain('unparseable_last_updated');
  });

  it('does not award 100 for a future date', () => {
    // Previously: Math.max(0, negative) clamped age to 0 -> a perfect score
    // for a record claiming to be updated in 2030.
    const q = calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(-400) });
    expect(q.freshnessScore).toBeLessThan(100);
    expect(q.flags).toContain('future_last_updated');
  });

  it('tolerates small clock skew without flagging', () => {
    const q = calculateIntelligenceQuality({
      ...solid,
      lastUpdated: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(q.freshnessScore).toBe(100);
    expect(q.flags).not.toContain('future_last_updated');
  });

  it('ranks unknown age below fresh and above ancient', () => {
    const fresh = calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(1) });
    const unknown = calculateIntelligenceQuality({ ...solid, lastUpdated: null });
    const ancient = calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(400) });

    expect(unknown.freshnessScore).toBeLessThan(fresh.freshnessScore);
    expect(unknown.freshnessScore).toBeGreaterThan(ancient.freshnessScore);
  });
});

describe('freshness actually moves the total score', () => {
  it('separates a fresh record from an ancient one', () => {
    const fresh = calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(1) });
    const ancient = calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(400) });

    // Guards the regression directly: when freshness was pinned at 100 these
    // two were identical.
    expect(fresh.totalScore).toBeGreaterThan(ancient.totalScore);
  });

  it('leaves the other components untouched by age', () => {
    const fresh = calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(1) });
    const ancient = calculateIntelligenceQuality({ ...solid, lastUpdated: daysAgo(400) });

    expect(ancient.sourceScore).toBe(fresh.sourceScore);
    expect(ancient.evidenceScore).toBe(fresh.evidenceScore);
    expect(ancient.completenessScore).toBe(fresh.completenessScore);
    expect(ancient.confidenceScore).toBe(fresh.confidenceScore);
  });
});
