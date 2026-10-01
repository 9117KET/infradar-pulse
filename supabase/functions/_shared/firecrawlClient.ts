/**
 * Firecrawl client — search + scrape.
 *
 * Supports BOTH connection modes:
 *   - direct API  (FIRECRAWL_API_KEY starts with "fc-") → https://api.firecrawl.dev/v2
 *   - gateway     (Lovable connection key, "lovc_")     → connector gateway
 *   - self-hosted (FIRECRAWL_API_URL set, e.g. http://firecrawl:3002) → the
 *     open-source Firecrawl server (github.com/firecrawl/firecrawl, AGPL-3.0).
 *     No credits; the key is optional (only sent when present).
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

/** Self-hosted Firecrawl base URL (no trailing slash), or "" when unset. */
function selfHostedUrl(): string {
  return (Deno.env.get("FIRECRAWL_API_URL") ?? "").trim().replace(/\/+$/, "");
}

/** Direct provider key (fc-*) or a self-hosted server → never the gateway. */
function isDirectMode(): boolean {
  return Boolean(selfHostedUrl()) || firecrawlKey().startsWith("fc-");
}

export function isFirecrawlConfigured(): boolean {
  if (selfHostedUrl()) return true;
  const key = firecrawlKey();
  if (!key) return false;
  return isDirectMode() || Boolean(Deno.env.get("LOVABLE_API_KEY"));
}

function baseUrl(): string {
  if (selfHostedUrl()) return `${selfHostedUrl()}/v2`;
  return isDirectMode() ? `${DIRECT_URL}/v2` : `${GATEWAY_URL}/v2`;
}

function headers(): Record<string, string> {
  const key = firecrawlKey();
  if (isDirectMode()) {
    return key
      ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
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

// Default ~12 req/min (hosted free plan). Paid plans and self-hosted servers
// can raise throughput with FIRECRAWL_MIN_SPACING_MS (e.g. 500, or 0).
const MIN_REQUEST_SPACING_MS = (() => {
  const v = Number(Deno.env.get("FIRECRAWL_MIN_SPACING_MS"));
  return Number.isFinite(v) && v >= 0 ? v : 5_000;
})();
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
    const res = await firecrawlRequest("/search", {
      query,
      limit: opts.limit ?? 5,
      tbs: opts.tbs,
      scrapeOptions: opts.scrape ? { formats: ["markdown"] } : undefined,
    }, `search:${query.slice(0, 80)}`);
    if (!res) return [];
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
    const res = await firecrawlRequest("/scrape", {
      url,
      formats: opts.formats ?? ["markdown"],
      onlyMainContent: opts.onlyMainContent ?? true,
    }, url);
    if (!res) return null;
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

/**
 * Structured extraction from one page: Firecrawl's LLM fills `schema`
 * (a JSON Schema object) from the page content. Use for tender notices,
 * award pages and project fact sheets where we want typed fields rather than
 * markdown. Returns the extracted object (plus the page markdown when
 * `includeMarkdown`), or null.
 */
export async function firecrawlExtract<T = Record<string, unknown>>(
  url: string,
  schema: Record<string, unknown>,
  opts: { prompt?: string; includeMarkdown?: boolean; onlyMainContent?: boolean } = {},
): Promise<{ url: string; data: T; markdown?: string; title?: string } | null> {
  if (!isFirecrawlConfigured()) return null;
  try {
    const formats: unknown[] = [{ type: "json", schema, ...(opts.prompt ? { prompt: opts.prompt } : {}) }];
    if (opts.includeMarkdown) formats.push("markdown");
    const res = await firecrawlRequest("/scrape", {
      url,
      formats,
      onlyMainContent: opts.onlyMainContent ?? true,
    }, `extract:${url}`);
    if (!res) return null;
    const body = await res.json();
    const doc = body?.data ?? body;
    if (!doc?.json || typeof doc.json !== "object") return null;
    return { url, data: doc.json as T, markdown: doc?.markdown, title: doc?.metadata?.title };
  } catch (e) {
    console.error("firecrawl extract error", e);
    return null;
  }
}

/**
 * Discover URLs on a site without scraping them (Firecrawl /map). `search`
 * ranks results by relevance, e.g. map a procurement portal for "tender".
 */
export async function firecrawlMap(
  url: string,
  opts: { search?: string; limit?: number; includeSubdomains?: boolean } = {},
): Promise<{ url: string; title?: string; description?: string }[]> {
  if (!isFirecrawlConfigured()) return [];
  try {
    const res = await firecrawlRequest("/map", {
      url,
      search: opts.search,
      limit: opts.limit ?? 100,
      includeSubdomains: opts.includeSubdomains ?? false,
    }, `map:${url}`);
    if (!res) return [];
    const body = await res.json();
    const links: unknown[] = body?.links ?? body?.data?.links ?? [];
    return links
      .map((l) => (typeof l === "string" ? { url: l } : (l as { url: string; title?: string; description?: string })))
      .filter((l) => typeof l?.url === "string" && l.url.startsWith("http"));
  } catch (e) {
    console.error("firecrawl map error", e);
    return [];
  }
}
