import { describe, it, expect } from 'vitest';
import { resolveResumeStep, computePreselectedIds, TOTAL_ONBOARDING_STEPS } from './onboarding';

describe('resolveResumeStep', () => {
  it('returns 0 for a missing profile or missing column', () => {
    expect(resolveResumeStep(null)).toBe(0);
    expect(resolveResumeStep(undefined)).toBe(0);
    expect(resolveResumeStep({})).toBe(0);
    expect(resolveResumeStep({ onboarding_step: null })).toBe(0);
  });

  it('returns the stored step when in range', () => {
    expect(resolveResumeStep({ onboarding_step: 0 })).toBe(0);
    expect(resolveResumeStep({ onboarding_step: 3 })).toBe(3);
  });

  it('clamps out-of-range values', () => {
    expect(resolveResumeStep({ onboarding_step: -2 })).toBe(0);
    expect(resolveResumeStep({ onboarding_step: 99 })).toBe(TOTAL_ONBOARDING_STEPS - 1);
    // Stale value from the old 7-step wizard
    expect(resolveResumeStep({ onboarding_step: 6 })).toBe(TOTAL_ONBOARDING_STEPS - 1);
  });
});

describe('computePreselectedIds', () => {
  const suggested = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }, { id: 'g' }];

  it('pre-selects the top 5 suggestions when untouched and nothing is tracked', () => {
    const result = computePreselectedIds(suggested, [], false, new Set());
    expect([...result]).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('respects a custom limit', () => {
    const result = computePreselectedIds(suggested, [], false, new Set(), 2);
    expect([...result]).toEqual(['a', 'b']);
  });

  it('handles fewer suggestions than the limit', () => {
    const result = computePreselectedIds([{ id: 'a' }, { id: 'b' }], [], false, new Set());
    expect([...result]).toEqual(['a', 'b']);
  });

  it('already-tracked projects win over the top-5 default', () => {
    const result = computePreselectedIds(suggested, ['f', 'g'], false, new Set());
    expect([...result].sort()).toEqual(['f', 'g']);
  });

  it('ignores tracked ids that are not among the suggestions', () => {
    const result = computePreselectedIds(suggested, ['not-suggested'], false, new Set());
    expect([...result]).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('preserves the current selection once the user has touched it', () => {
    const current = new Set(['c']);
    const result = computePreselectedIds(suggested, ['f'], true, current);
    expect(result).toBe(current);
  });

  it('preserves an emptied selection once touched (explicit deselect-all)', () => {
    const result = computePreselectedIds(suggested, [], true, new Set());
    expect(result.size).toBe(0);
  });
});
