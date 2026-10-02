import { describe, expect, it } from 'vitest';
import { parseCsv, parseProspectCsv, prospectKey } from './prospectCsv';

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });

  it('drops blank lines', () => {
    expect(parseCsv('a\n\n b \n')).toEqual([['a'], [' b ']]);
  });
});

describe('parseProspectCsv', () => {
  it('maps header aliases and normalises values', () => {
    const csv = [
      'Full Name,Company,Title,Email,LinkedIn URL,Persona,Wave,Region,Sector,Source',
      'Jane Doe,DEG,Director,Jane.Doe@DEG.de,https://linkedin.com/in/jd,dfi_analyst,2,Africa,Energy,https://deginvest.de/x',
    ].join('\n');
    const { rows, errors } = parseProspectCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      name: 'Jane Doe', org: 'DEG', role: 'Director', email: 'jane.doe@deg.de',
      linkedin_url: 'https://linkedin.com/in/jd', persona: 'dfi_analyst', wave: 2,
      source_url: 'https://deginvest.de/x',
    });
  });

  it('applies defaults and rejects bad rows with line numbers', () => {
    const csv = 'name,email,persona,wave,linkedin\nA,,,9,not-a-url\n,x@y.com,,,\nB,bad-email,,,\nC,,astronaut,,';
    const { rows, errors } = parseProspectCsv(csv, 'epc_bd');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'A', persona: 'epc_bd', wave: 1, linkedin_url: null, email: null });
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });

  it('requires a name column', () => {
    expect(parseProspectCsv('email\na@b.co').errors[0].message).toMatch(/name/);
  });
});

describe('prospectKey', () => {
  it('prefers email, falls back to name+org', () => {
    expect(prospectKey({ name: 'X', org: 'Y', email: 'A@B.co' })).toBe('e:a@b.co');
    expect(prospectKey({ name: ' Jane ', org: 'DEG', email: null })).toBe('n:jane|deg');
  });
});
