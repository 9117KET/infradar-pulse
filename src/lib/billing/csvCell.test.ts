import { describe, expect, it } from 'vitest';
import { csvCell } from './exportCaps';

describe('csvCell', () => {
  it('doubles embedded quotes', () => {
    expect(csvCell('Phase "A" works')).toBe('"Phase ""A"" works"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
  });

  it('renders null and numbers', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });
});
