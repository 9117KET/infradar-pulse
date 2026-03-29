/** Edge Function returned 403 for batch agents (admin/researcher only). */
export function isStaffOnlyError(error: unknown): boolean {
  if (error == null) return false;
  const e = error as { message?: string; context?: { status?: number } };
  if (e.context?.status === 403) return true;
  const m = String(e.message ?? '');
  return m.includes('STAFF_ONLY') || /non-2xx status code\s*403/i.test(m);
}

/** Detect Edge Function failures due to quota / billing (HTTP 402 or message hints). */
export function isEntitlementOrQuotaError(error: unknown): boolean {
  if (error == null) return false;
  const e = error as { message?: string; context?: { status?: number } };
  if (e.context?.status === 402) return true;
  const m = String(e.message ?? '').toLowerCase();
  if (m.includes('402')) return true;
  if (m.includes('entitlement')) return true;
  if (m.includes('daily ai')) return true;
  if (m.includes('limit reached')) return true;
  if (m.includes('export limit')) return true;
  if (m.includes('sign in required')) return true;
  return false;
}
