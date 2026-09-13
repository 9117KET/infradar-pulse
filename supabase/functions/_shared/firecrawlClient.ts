/**
 * Firecrawl client — search + scrape.
 *
 * Supports BOTH connection modes:
 *   - direct API  (FIRECRAWL_API_KEY starts with "fc-") → https://api.firecrawl.dev/v2
 *   - gateway     (Lovable connection key, "lovc_")     → connector gateway
 *
 * The project's Firecrawl connection is direct-API; calling the gateway with an
 * `fc-` key returns 401 "Credential not found", which silently disabled every
 * scrape-based contact/evidence discovery path.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firecrawl";
const DIRECT_URL = "https://api.firecrawl.dev";

export type FirecrawlSearchResult = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

function firecrawlKey(): string {
  return (Deno.env.get("FIRECRAWL_API_KEY") ?? "").trim();
}

/** Direct provider key (fc-*) → call Firecrawl directly, never the gateway. */
function isDirectMode(): boolean {
  return firecrawlKey().startsWith("fc-");
}

export function isFirecrawlConfigured(): boolean {
  const key = firecrawlKey();
  if (!key) return false;
  return isDirectMode() || Boolean(Deno.env.get("LOVABLE_API_KEY"));
}

function baseUrl(): string {
  return isDirectMode() ? `${DIRECT_URL}/v2` : `${GATEWAY_URL}/v2`;
}

function headers(): Record<string, string> {
  const key = firecrawlKey();
  if (isDirectMode()) {
    return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  }
  const lovable = Deno.env.get("LOVABLE_API_KEY");
  if (!lovable) throw new Error("LOVABLE_API_KEY missing");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": key,
    "Content-Type": "application/json",
  };
}

/* ---------------------------------------------------------------------------
 * Rate limiting + retry
 *
 * The plan allows ~12 requests/minute; bursts returned 429 ("Remaining: 0,
 * retry after 1-2s") and transient 500 SCRAPE_SITE_ERROR/tunnel failures.
 * Requests are spaced out and retried with short backoff so callers stop
 * seeing transient failures as "no data found".
 * ------------------------------------------------------------------------- */

const MIN_REQUEST_SPACING_MS = 5_000; // ~12 req/min
const MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 8_000;

let nextSlot = 0;

/** Last transient/HTTP failure seen, so callers can distinguish it from empty results. */
let lastFailure: { url: string; status: number; detail: string; at: string } | null = null;

export function getLastFirecrawlFailure() {
  return lastFailure;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_REQUEST_SPACING_MS;
  if (wait > 0) await sleep(wait);
}

function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  const fromHeader = header ? Number(header) * 1000 : NaN;
  const base = Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : 1_000 * 2 ** (attempt - 1);
  return Math.min(base + Math.floor(Math.random() * 300), MAX_BACKOFF_MS);
}

/** POST to Firecrawl with throttling and retry on 429 / transient 5xx. */
async function firecrawlRequest(
  path: string,
  body: unknown,
  label: string,
): Promise<Response | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await throttle();
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}${path}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastFailure = { url: label, status: 0, detail: String(e).slice(0, 200), at: new Date().toISOString() };
      console.error(`firecrawl ${path} network error (attempt ${attempt})`, e);
      if (attempt === MAX_ATTEMPTS) return null;
      await sleep(Math.min(1_000 * 2 ** (attempt - 1), MAX_BACKOFF_MS));
      continue;
    }

    if (res.ok) return res;

    const detail = (await res.text()).slice(0, 300);
    lastFailure = { url: label, status: res.status, detail, at: new Date().toISOString() };
    const retryable = res.status === 429 || res.status >= 500;
    console.error(`firecrawl ${path} ${res.status} (attempt ${attempt}) ${detail}`);
    if (!retryable || attempt === MAX_ATTEMPTS) return null;
    await sleep(retryDelayMs(res, attempt));
  }
  return null;
}

/** Web search with optional content scrape. Returns up to `limit` results. */
export async function firecrawlSearch(
  query: string,
  opts: { limit?: number; scrape?: boolean; tbs?: string } = {},
): Promise<FirecrawlSearchResult[]> {
  if (!isFirecrawlConfigured()) return [];
  try {
    const res = await fetch(`${baseUrl()}/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        query,
        limit: opts.limit ?? 5,
        tbs: opts.tbs,
        scrapeOptions: opts.scrape ? { formats: ["markdown"] } : undefined,
      }),
    });
    if (!res.ok) {
      console.error("firecrawl search", res.status, (await res.text()).slice(0, 200));
      return [];
    }
    const data = await res.json();
    // v2 returns { data: { web: [...], news: [...], images: [...] } }, older
    // shapes return a flat array or { web: { results: [...] } }.
    const payload = data?.data ?? data;
    const items: Record<string, unknown>[] = Array.isArray(payload)
      ? payload
      : [
          ...(Array.isArray(payload?.web) ? payload.web : []),
          ...(Array.isArray(payload?.web?.results) ? payload.web.results : []),
          ...(Array.isArray(payload?.news) ? payload.news : []),
          ...(Array.isArray(payload?.results) ? payload.results : []),
        ];
    return items.map((it: Record<string, unknown>) => ({
      url: String(it.url ?? ""),
      title: it.title as string | undefined,
      description: it.description as string | undefined,
      markdown: it.markdown as string | undefined,
    })).filter((r: FirecrawlSearchResult) => r.url.startsWith("http"));
  } catch (e) {
    console.error("firecrawl search error", e);
    return [];
  }
}

/** Scrape a single URL. Returns markdown, outbound links and metadata, or null. */
export async function firecrawlScrape(
  url: string,
  opts: { formats?: string[]; onlyMainContent?: boolean } = {},
): Promise<{ url: string; markdown?: string; title?: string; links?: string[] } | null> {
  if (!isFirecrawlConfigured()) return null;
  try {
    const res = await fetch(`${baseUrl()}/scrape`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        url,
        formats: opts.formats ?? ["markdown"],
        onlyMainContent: opts.onlyMainContent ?? true,
      }),
    });
    if (!res.ok) {
      console.error("firecrawl scrape", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const data = await res.json();
    const doc = data?.data ?? data;
    return {
      url,
      markdown: doc?.markdown,
      title: doc?.metadata?.title,
      links: Array.isArray(doc?.links) ? doc.links.filter((l: unknown) => typeof l === "string") : undefined,
    };
  } catch (e) {
    console.error("firecrawl scrape error", e);
    return null;
  }
}
