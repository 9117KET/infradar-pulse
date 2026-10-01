/**
 * Open-source / no-credit scraping and search fallbacks.
 *
 * Used by scrapeRouter when Firecrawl is unconfigured, out of credits or
 * failing, so evidence and contact discovery keep producing citable sources.
 *
 *   - Jina Reader  (github.com/jina-ai/reader, Apache-2.0): https://r.jina.ai/<url>
 *     returns clean markdown for JS-light pages. Works keyless at a low rate
 *     limit; JINA_API_KEY raises it. JINA_READER_URL points at a self-hosted
 *     reader instead.
 *   - Plain fetch + HTML-to-text: last resort, no dependencies.
 *   - SearXNG      (github.com/searxng/searxng, AGPL-3.0): self-hosted
 *     metasearch with a JSON API. Set SEARXNG_URL (JSON format must be enabled
 *     in the instance's settings.yml: search.formats: [html, json]).
 */

import { isPlausibleSourceUrl } from "./urlHygiene.ts";

export type OpenScrapeResult = {
  url: string;
  markdown: string;
  title?: string;
  links?: string[];
  provider: "jina" | "fetch";
};

export type OpenSearchResult = { url: string; title?: string; description?: string };

const USER_AGENT = "InfraRadarBot/1.0 (+https://infradarai.com)";
const TIMEOUT_MS = 20_000;

/** Refuse loopback / private-network targets so a scraped link can't reach internal services. */
function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h.startsWith("[")) return false; // raw IPv6 literals
  return true;
}

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    console.error(`openScrape fetch failed ${url.slice(0, 120)}`, String(e).slice(0, 200));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(markdownOrHtml: string, base: string): string[] {
  const out = new Set<string>();
  const re = /(?:href="|\]\()((?:https?:\/\/|\/)[^"\s)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdownOrHtml)) && out.size < 300) {
    try {
      out.add(new URL(m[1], base).toString());
    } catch { /* skip malformed */ }
  }
  return [...out];
}

/** Jina Reader → markdown. Returns null on any failure or an empty page. */
export async function jinaScrape(url: string): Promise<OpenScrapeResult | null> {
  if (!isPublicHttpUrl(url)) return null;
  const base = (Deno.env.get("JINA_READER_URL") ?? "https://r.jina.ai").replace(/\/+$/, "");
  const key = (Deno.env.get("JINA_API_KEY") ?? "").trim();
  const res = await timedFetch(`${base}/${url}`, {
    headers: {
      Accept: "application/json",
      "X-With-Links-Summary": "true",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
  });
  if (!res?.ok) {
    if (res) console.error(`jina reader ${res.status} for ${url.slice(0, 120)}`);
    return null;
  }
  try {
    const body = await res.json();
    const d = body?.data ?? body;
    const markdown = typeof d?.content === "string" ? d.content : "";
    if (markdown.trim().length < 50) return null;
    const linkMap = d?.links && typeof d.links === "object" ? Object.values(d.links) : [];
    const links = (linkMap as unknown[]).filter((l): l is string => typeof l === "string");
    return {
      url,
      markdown,
      title: typeof d?.title === "string" ? d.title : undefined,
      links: links.length ? links : extractLinks(markdown, url),
      provider: "jina",
    };
  } catch (e) {
    console.error("jina reader parse error", e);
    return null;
  }
}

/** Minimal HTML → text. Good enough for LLM extraction, not for display. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Plain HTTP fetch → text. Last-resort scraper; no JS rendering. */
export async function plainFetchScrape(url: string): Promise<OpenScrapeResult | null> {
  if (!isPublicHttpUrl(url)) return null;
  const res = await timedFetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain" },
    redirect: "follow",
  });
  if (!res?.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/|html|xml|json/.test(type)) return null;
  const raw = (await res.text()).slice(0, 2_000_000);
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const markdown = /html/.test(type) ? htmlToText(raw) : raw;
  if (markdown.length < 50) return null;
  return { url, markdown, title, links: extractLinks(raw, url), provider: "fetch" };
}

export function isSearxngConfigured(): boolean {
  return Boolean((Deno.env.get("SEARXNG_URL") ?? "").trim());
}

/** SearXNG metasearch (self-hosted). Empty array when unconfigured or failing. */
export async function searxngSearch(
  query: string,
  opts: { limit?: number; timeRange?: "day" | "week" | "month" | "year" } = {},
): Promise<OpenSearchResult[]> {
  const base = (Deno.env.get("SEARXNG_URL") ?? "").trim().replace(/\/+$/, "");
  if (!base) return [];
  const params = new URLSearchParams({ q: query, format: "json" });
  if (opts.timeRange) params.set("time_range", opts.timeRange);
  const res = await timedFetch(`${base}/search?${params}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res?.ok) {
    if (res) console.error(`searxng ${res.status} (is the json format enabled?)`);
    return [];
  }
  try {
    const body = await res.json();
    const results: Record<string, unknown>[] = Array.isArray(body?.results) ? body.results : [];
    return results
      .map((r) => ({
        url: String(r.url ?? ""),
        title: r.title as string | undefined,
        description: r.content as string | undefined,
      }))
      .filter((r) => isPlausibleSourceUrl(r.url))
      .slice(0, opts.limit ?? 5);
  } catch (e) {
    console.error("searxng parse error", e);
    return [];
  }
}
