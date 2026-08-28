/**
 * Drift guard for the two copies of the intelligence-quality scorer.
 *
 * `src/lib/intelligence-quality.ts` (Vite client) and
 * `supabase/functions/_shared/intelligenceQuality.ts` (Deno edge) implement the
 * same algorithm. They cannot share a module: the app tsconfig's `include` is
 * scoped to `src`, and widening it would pull the Deno function tree into the
 * client typecheck.
 *
 * So instead of trusting them to stay in step, this runs both over the same
 * fixtures and fails the build the moment they disagree. The two differ only in
 * naming convention (camelCase vs snake_case), which the mapping below absorbs.
 *
 * If this test fails, do not "fix" it by loosening the assertion - port the
 * change to whichever copy is behind. The number these produce is the one the
 * product's credibility rests on, and a silent divergence means the server and
 * the UI disagree about whether a project can be trusted.
 */
import { describe, it, expect } from 'vitest';
import { calculateIntelligenceQuality as client } from './intelligence-quality';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - outside the app tsconfig's `include`; resolved by Vite at runtime.
import { calculateIntelligenceQuality as edge } from '../../supabase/functions/_shared/intelligenceQuality.ts';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const fixtures: Array<{ name: string; input: Record<string, unknown> }> = [
  {
    name: 'complete official-registry record',
    input: {
      sourceUrl: 'https://projects.worldbank.org/p/P123456',
      confidence: 92, description: 'x'.repeat(140), valueUsd: 1_310_000_000,
      lat: 14.9, lng: 1.05, evidenceCount: 3, officialSourceCount: 1,
      contactCount: 2, lastUpdated: daysAgo(3),
    },
  },
  { name: 'no source url at all', input: { confidence: 80, description: 'y'.repeat(100), valueUsd: 5e8, lat: 1, lng: 1, evidenceCount: 2, lastUpdated: daysAgo(10) } },
  { name: 'placeholder hash source', input: { sourceUrl: '#', confidence: 50, description: 'z'.repeat(90), valueUsd: 1e8, lastUpdated: daysAgo(20) } },
  { name: 'null island coordinates', input: { sourceUrl: 'https://adb.org/p/1', confidence: 60, description: 'q'.repeat(85), valueUsd: 2e8, lat: 0, lng: 0, evidenceCount: 1, lastUpdated: daysAgo(5) } },
  { name: 'missing everything optional', input: { sourceUrl: 'https://afdb.org/p/2' } },
  { name: 'unknown age', input: { sourceUrl: 'https://ebrd.com/p/3', confidence: 70, description: 'w'.repeat(120), valueUsd: 3e8, lat: 5, lng: 5, evidenceCount: 2, officialSourceCount: 1, contactCount: 1, lastUpdated: null } },
  { name: 'unparseable date', input: { sourceUrl: 'https://iadb.org/p/4', confidence: 70, description: 'e'.repeat(100), valueUsd: 4e8, evidenceCount: 1, lastUpdated: 'sometime last year' } },
  { name: 'future date', input: { sourceUrl: 'https://aiib.org/p/5', confidence: 70, description: 'r'.repeat(100), valueUsd: 6e8, evidenceCount: 1, lastUpdated: daysAgo(-500) } },
  { name: 'exactly at the 30 day tier', input: { sourceUrl: 'https://ifc.org/p/6', confidence: 65, description: 't'.repeat(95), valueUsd: 7e8, lat: 9, lng: 9, evidenceCount: 2, officialSourceCount: 1, lastUpdated: daysAgo(31) } },
  { name: 'exactly at the 180 day tier', input: { sourceUrl: 'https://ifc.org/p/7', confidence: 65, description: 'u'.repeat(95), valueUsd: 8e8, lat: 9, lng: 9, evidenceCount: 2, officialSourceCount: 1, lastUpdated: daysAgo(181) } },
  { name: 'zero confidence', input: { sourceUrl: 'https://worldbank.org/p/8', confidence: 0, description: 'i'.repeat(100), valueUsd: 9e8, evidenceCount: 2, officialSourceCount: 1, lastUpdated: daysAgo(2) } },
  { name: 'confidence above range', input: { sourceUrl: 'https://worldbank.org/p/9', confidence: 180, description: 'o'.repeat(100), valueUsd: 1e9, evidenceCount: 2, officialSourceCount: 1, lastUpdated: daysAgo(2) } },
];

describe('client and edge scorers agree', () => {
  it.each(fixtures)('$name', ({ input }) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const c = client(input as any);
    const e = edge(input as any) as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    expect({
      total: c.totalScore,
      source: c.sourceScore,
      evidence: c.evidenceScore,
      completeness: c.completenessScore,
      freshness: c.freshnessScore,
      confidence: c.confidenceScore,
      missing: [...c.missingFields].sort(),
      flags: [...c.flags].sort(),
      recommendation: c.recommendation,
    }).toEqual({
      total: e.total_score,
      source: e.source_score,
      evidence: e.evidence_score,
      completeness: e.completeness_score,
      freshness: e.freshness_score,
      confidence: e.confidence_score,
      missing: [...e.missing_fields].sort(),
      flags: [...e.flags].sort(),
      recommendation: e.recommendation,
    });
  });
});
