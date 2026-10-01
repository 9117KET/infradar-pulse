/**
 * scrapeRouter — one entry point for "get this page" and "search the web",
 * cascading through every configured provider so a Firecrawl outage or empty
 * credit balance degrades coverage instead of zeroing it.
 *
 *   scrapeUrl:  Firecrawl (hosted or self-hosted) → Jina Reader → plain fetch
 *   webSearch:  Firecrawl search → SearXNG
 *
 * Override the scrape order with SCRAPE_PROVIDERS, a comma list drawn from
 * firecrawl,jina,fetch (e.g. "jina,fetch" to run with zero Firecrawl spend).
 */

import {
  firecrawlScrape,
  firecrawlSearch,
  isFirecrawlConfigured,
  type FirecrawlSearchResult,
} from "./firecrawlClient.ts";
import { isSearxngConfigured, jinaScrape, plainFetchScrape, searxngSearch } from "./openScrape.ts";

export type ScrapeProvider = "firecrawl" | "jina" | "fetch";

export type ScrapedPage = {
  url: string;
  markdown: string;
  title?: string;
  links?: string[];
  provider: ScrapeProvider;
};

export type SearchHit = FirecrawlSearchResult & { provider: "firecrawl" | "searxng" };

const DEFAULT_ORDER: ScrapeProvider[] = ["firecrawl", "jina", "fetch"];

function scrapeOrder(): ScrapeProvider[] {
  const raw = (Deno.env.get("SCRAPE_PROVIDERS") ?? "").trim();
  if (!raw) return DEFAULT_ORDER;
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ScrapeProvider => s === "firecrawl" || s === "jina" || s === "fetch");
  return parsed.length ? parsed : DEFAULT_ORDER;
}

/** Scrape one URL with the first provider that returns usable content. */
export async function scrapeUrl(url: string): Promise<ScrapedPage | null> {
  for (const provider of scrapeOrder()) {
    if (provider === "firecrawl") {
      if (!isFirecrawlConfigured()) continue;
      const page = await firecrawlScrape(url, { formats: ["markdown", "links"], onlyMainContent: true });
      if (page?.markdown && page.markdown.trim().length >= 50) {
        return { url, markdown: page.markdown, title: page.title, links: page.links, provider };
      }
    } else if (provider === "jina") {
      const page = await jinaScrape(url);
      if (page) return { ...page, provider };
    } else {
      const page = await plainFetchScrape(url);
      if (page) return { ...page, provider };
    }
  }
  return null;
}

/** True when at least one scrape provider can run (plain fetch always can). */
export function isScrapingAvailable(): boolean {
  return scrapeOrder().some((p) => p !== "firecrawl" || isFirecrawlConfigured());
}

export function isWebSearchAvailable(): boolean {
  return isFirecrawlConfigured() || isSearxngConfigured();
}

/** Web search: Firecrawl first (optionally with page content), then SearXNG. */
export async function webSearch(
  query: string,
  opts: { limit?: number; scrape?: boolean; recency?: "day" | "week" | "month" | "year" } = {},
): Promise<SearchHit[]> {
  if (isFirecrawlConfigured()) {
    const tbs = opts.recency ? { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" }[opts.recency] : undefined;
    const hits = await firecrawlSearch(query, { limit: opts.limit, scrape: opts.scrape, tbs });
    if (hits.length) return hits.map((h) => ({ ...h, provider: "firecrawl" as const }));
  }
  if (isSearxngConfigured()) {
    const hits = await searxngSearch(query, { limit: opts.limit, timeRange: opts.recency });
    if (!opts.scrape) return hits.map((h) => ({ ...h, provider: "searxng" as const }));
    // Deep mode: pull page text for the top hits so callers get evidence, not just snippets.
    const withText = await Promise.all(
      hits.map(async (h, i) => {
        const page = i < 3 ? await scrapeUrl(h.url) : null;
        return { ...h, markdown: page?.markdown, provider: "searxng" as const };
      }),
    );
    return withText;
  }
  return [];
}
