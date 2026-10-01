import { describe, expect, it } from 'vitest';
import { PRICES, perMonth, yearlySavingPct } from './pricing';

describe('pricing', () => {
  it('yearly plans save about 20% on both paid tiers', () => {
    expect(yearlySavingPct(PRICES.starter)).toBe(21);
    expect(yearlySavingPct(PRICES.pro)).toBe(20);
  });

  it('formats the per-month equivalent', () => {
    expect(perMonth(PRICES.pro.yearly)).toBe('$63.00');
    expect(perMonth(PRICES.starter.yearly)).toBe('$15.00');
  });

  it('lifetime stays a better deal than ~13 months of Pro but more than one year', () => {
    expect(PRICES.lifetime).toBeGreaterThan(PRICES.pro.yearly);
    expect(PRICES.lifetime).toBeLessThan(PRICES.pro.monthly * 13);
  });
});
