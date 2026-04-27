const STORAGE_KEY = 'infradarai_utm';

export interface UtmParams {
  acq_source?: string;
  acq_medium?: string;
  acq_campaign?: string;
  acq_term?: string;
  acq_content?: string;
}

/**
 * Read UTM params from the current URL and persist them in sessionStorage.
 * Only writes if the URL actually contains at least one utm_* param.
 * Does NOT overwrite an existing entry so the first-touch attribution is preserved.
 */
export function captureUtmParams(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const source = params.get('utm_source') ?? params.get('ref');
  if (!source) return; // nothing to capture
  if (sessionStorage.getItem(STORAGE_KEY)) return; // already captured

  const entry: UtmParams = {
    acq_source: source || undefined,
    acq_medium: params.get('utm_medium') ?? undefined,
    acq_campaign: params.get('utm_campaign') ?? undefined,
    acq_term: params.get('utm_term') ?? undefined,
    acq_content: params.get('utm_content') ?? undefined,
  };
  // Strip undefined keys so we don't write empty strings to the DB
  Object.keys(entry).forEach(k => {
    if ((entry as Record<string, unknown>)[k] === undefined) {
      delete (entry as Record<string, unknown>)[k];
    }
  });
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
}

/** Return stored UTM params, or null if none were captured. */
export function getStoredUtmParams(): UtmParams | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UtmParams;
  } catch {
    return null;
  }
}

/** Clear stored UTMs (call after they have been written to the DB). */
export function clearUtmParams(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}
