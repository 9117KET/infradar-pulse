/**
 * Firecrawl client — search + scrape via the Lovable connector gateway.
 *
 * Used as a fallback to Perplexity for monitoring/research, and as the
 * primary for page extraction (contact-finder, data-enrichment).
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firecrawl";

export type FirecrawlSearchResult = {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
};

function requireKeys(): { lovable: string; firecrawl: string } {
  const lovable = Deno.env.get("LOVABLE_API_KEY");
  const firecrawl = Deno.env.get("FIRECRAWL_API_KEY");
  if (!lovable) throw new Error("LOVABLE_API_KEY missing");
  if (!firecrawl) throw new Error("FIRECRAWL_API_KEY missing");
  return { lovable, firecrawl };
}

function headers() {
  const { lovable, firecrawl } = requireKeys();
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": firecrawl,
    "Content-Type": "application/json",
  };
}

export function isFirecrawlConfigured(): boolean {
  return Boolean(Deno.env.get("LOVABLE_API_KEY") && Deno.env.get("FIRECRAWL_API_KEY"));
}

/** Web search with optional content scrape. Returns up to `limit` results. */
export async function firecrawlSearch(
  query: string,
  opts: { limit?: number; scrape?: boolean; tbs?: string } = {},
): Promise<FirecrawlSearchResult[]> {
  if (!isFirecrawlConfigured()) return [];
  try {
    const res = await fetch(`${GATEWAY_URL}/v2/search`, {
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
    const items = data?.data ?? data?.web?.results ?? [];
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

/** Scrape a single URL. Returns markdown + metadata or null. */
export async function firecrawlScrape(
  url: string,
  opts: { formats?: string[]; onlyMainContent?: boolean } = {},
): Promise<{ url: string; markdown?: string; title?: string } | null> {
  if (!isFirecrawlConfigured()) return null;
  try {
    const res = await fetch(`${GATEWAY_URL}/v2/scrape`, {
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
    };
  } catch (e) {
    console.error("firecrawl scrape error", e);
    return null;
  }
}
