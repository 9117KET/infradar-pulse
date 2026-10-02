/**
 * Bulk prospect import for /dashboard/outreach.
 *
 * Accepts a CSV with a header row. Recognised columns (case-insensitive,
 * spaces/underscores ignored): name, org|organisation|organization|company,
 * role|title, email, linkedin|linkedin_url, persona, wave, region, sector,
 * source_url|source, notes. Only `name` is required.
 */

export const PROSPECT_PERSONAS = [
  'dfi_analyst', 'infra_pe', 'epc_bd', 'consultant',
  'project_finance', 'political_risk', 'government_ppp', 'think_tank',
] as const;

export type ProspectInsert = {
  name: string;
  org: string | null;
  role: string | null;
  email: string | null;
  linkedin_url: string | null;
  persona: string;
  wave: number;
  region: string | null;
  sector: string | null;
  source_url: string | null;
  notes: string | null;
};

export type ProspectCsvResult = {
  rows: ProspectInsert[];
  errors: { line: number; message: string }[];
};

const HEADER_ALIASES: Record<string, keyof ProspectInsert> = {
  name: 'name', fullname: 'name',
  org: 'org', organisation: 'org', organization: 'org', company: 'org',
  role: 'role', title: 'role', jobtitle: 'role',
  email: 'email', emailaddress: 'email',
  linkedin: 'linkedin_url', linkedinurl: 'linkedin_url',
  persona: 'persona',
  wave: 'wave',
  region: 'region',
  sector: 'sector',
  sourceurl: 'source_url', source: 'source_url',
  notes: 'notes', note: 'notes', trigger: 'notes',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RFC 4180 CSV → rows of cells. Handles quoted fields, "" escapes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-]/g, '');
}

export function parseProspectCsv(text: string, defaultPersona = 'infra_pe'): ProspectCsvResult {
  const table = parseCsv(text);
  const errors: ProspectCsvResult['errors'] = [];
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'CSV needs a header row and at least one prospect.' }] };

  const columns = table[0].map((h) => HEADER_ALIASES[normaliseHeader(h)] ?? null);
  if (!columns.includes('name')) return { rows: [], errors: [{ line: 1, message: 'Missing required "name" column.' }] };

  const rows: ProspectInsert[] = [];
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const rec: Partial<Record<keyof ProspectInsert, string>> = {};
    columns.forEach((col, i) => { if (col) rec[col] = (cells[i] ?? '').trim(); });

    if (!rec.name) { errors.push({ line, message: 'Missing name.' }); return; }
    const email = rec.email ? rec.email.toLowerCase() : null;
    if (email && !EMAIL_RE.test(email)) { errors.push({ line, message: `Invalid email "${rec.email}".` }); return; }
    const persona = (rec.persona || defaultPersona).toLowerCase();
    if (!(PROSPECT_PERSONAS as readonly string[]).includes(persona)) {
      errors.push({ line, message: `Unknown persona "${rec.persona}".` }); return;
    }
    const wave = Number(rec.wave || 1);
    const linkedin = rec.linkedin_url || null;
    const source = rec.source_url || null;

    rows.push({
      name: rec.name,
      org: rec.org || null,
      role: rec.role || null,
      email,
      linkedin_url: linkedin && /^https?:\/\//i.test(linkedin) ? linkedin : null,
      persona,
      wave: [1, 2, 3].includes(wave) ? wave : 1,
      region: rec.region || null,
      sector: rec.sector || null,
      source_url: source && /^https?:\/\//i.test(source) ? source : null,
      notes: rec.notes || null,
    });
  });
  return { rows, errors };
}

/** Identity key for de-duplication: email when present, else name + org. */
export function prospectKey(p: { name: string; org: string | null; email: string | null }): string {
  if (p.email) return `e:${p.email.toLowerCase()}`;
  return `n:${p.name.trim().toLowerCase()}|${(p.org ?? '').trim().toLowerCase()}`;
}
