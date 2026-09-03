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
