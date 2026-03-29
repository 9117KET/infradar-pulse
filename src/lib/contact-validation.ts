/**
 * Shared rules for "reachable" contacts used in HITL verification:
 * name + (email OR phone) + http(s) source URL for provenance.
 */
export function isValidHttpUrl(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim().startsWith('http');
}

export interface ContactLike {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source_url?: string | null;
}

export function isReachableContact(c: ContactLike): boolean {
  const name = (c.name || '').trim();
  if (!name) return false;
  const hasEmail = !!(c.email && String(c.email).trim());
  const hasPhone = !!(c.phone && String(c.phone).trim());
  if (!hasEmail && !hasPhone) return false;
  return isValidHttpUrl(c.source_url);
}

export function filterReachableContacts<T extends ContactLike>(rows: T[]): T[] {
  return rows.filter(isReachableContact);
}
