/**
 * researchRouter — picks the right provider for a research query and returns
 * BOTH narrative text and grounded citations.
 *
 * Routing:
 *   monitoring  → Perplexity sonar       (fallback: Firecrawl → SearXNG search)
 *   deep        → Perplexity sonar-pro   (fallback: Firecrawl → SearXNG search + scrape)
 *   extraction  → Firecrawl scrape       (caller supplies URL)
 *
 * If both providers fail we degrade to Lovable AI narrative-only with
 * `degraded: true` and `citations: []` so callers know NOT to persist any
 * source URLs.
 *
 * Override via env: RESEARCH_PROVIDER=auto|perplexity|firecrawl|lovable
 *
 * CURRENT DEFAULT: firecrawl-only. Perplexity stays fully wired but is skipped
 * unless RESEARCH_PROVIDER is explicitly set to "perplexity" or "auto"
 * (re-enabling it later is a single env-var change, no code edit).
 */

import { callPerplexity, isPerplexityConfigured, perplexitySearch } from "./perplexityClient.ts";
import { exaSearch, isExaConfigured } from "./exaClient.ts";
import { isWebSearchAvailable, webSearch } from "./scrapeRouter.ts";
import { runResearchPrompt } from "./webResearch.ts";
import { filterPlausibleUrls } from "./urlHygiene.ts";

export type ResearchMode = "monitoring" | "deep" | "extraction";

export type ResearchResult = {
  text: string;
  citations: string[];
  provider: "perplexity" | "exa" | "firecrawl" | "searxng" | "lovable";
  degraded: boolean;
};

// "auto" = Perplexity → Exa → Firecrawl/SearXNG → Lovable AI; each step is
// skipped when its key is missing, so this is safe without new keys.
const DEFAULT_PROVIDER = "auto";

function preferredProvider(): "auto" | "perplexity" | "firecrawl" | "lovable" {
  const v = (Deno.env.get("RESEARCH_PROVIDER") ?? DEFAULT_PROVIDER).toLowerCase();
  if (v === "perplexity" || v === "firecrawl" || v === "lovable" || v === "auto") {
    return v as "auto" | "perplexity" | "firecrawl" | "lovable";
  }
  return DEFAULT_PROVIDER;
}

export async function research(params: {
  systemPrompt: string;
  userPrompt: string;
  mode?: ResearchMode;
  recency?: "day" | "week" | "month" | "year";
}): Promise<ResearchResult> {
  const mode = params.mode ?? "monitoring";
  const pref = preferredProvider();

  const tryPerplexity = pref === "auto" || pref === "perplexity";
  // Firecrawl is the default engine and also the fallback whenever Perplexity
  // is preferred but unavailable / out of credits.
  const tryFirecrawl = pref !== "lovable";

  // 1. Perplexity (grounded citations in a single call) — opt-in only
  // 1a. Perplexity Search API: raw ranked results; our own LLM extracts later.
  if (tryPerplexity && isPerplexityConfigured() && mode !== "deep") {
    const hits = await perplexitySearch(params.userPrompt, { maxResults: 10 });
    if (hits.length > 0) {
      return {
        text: hits.map((h, i) => `[${i + 1}] ${h.title}${h.date ? ` (${h.date})` : ""}\n${h.snippet}`).join("\n\n"),
        citations: filterPlausibleUrls(hits.map((h) => h.url)),
        provider: "perplexity",
        degraded: false,
      };
    }
  }
  // 1b. Deep mode: Sonar Pro grounded answer with citations.
  if (tryPerplexity && isPerplexityConfigured()) {
    const model = mode === "deep" ? "sonar-pro" : "sonar";
    const r = await callPerplexity({
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      model,
      recency: params.recency,
    });
    if (r && r.text) {
      return {
        text: r.text,
        citations: filterPlausibleUrls(r.citations),
        provider: "perplexity",
        degraded: false,
      };
    }
  }

  // 2. Exa semantic search (optional, only when EXA_API_KEY is set)
  if (pref !== "lovable" && isExaConfigured()) {
    const ex = await exaSearch(params.userPrompt, { limit: mode === "deep" ? 8 : 5, recency: params.recency });
    if (ex.length > 0) {
      return {
        text: ex.map((r, i) => `[${i + 1}] ${r.title ?? r.url}${r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : ""}\n${r.text ?? ""}`).join("\n\n"),
        citations: filterPlausibleUrls(ex.map((r) => r.url)),
        provider: "exa",
        degraded: false,
      };
    }
  }

  // 3. Web search (+ scrape for deep research): Firecrawl, then SearXNG
  if (tryFirecrawl && isWebSearchAvailable()) {
    const results = await webSearch(params.userPrompt, {
      limit: mode === "deep" ? 6 : 4,
      scrape: mode === "deep",
      recency: params.recency,
    });
    if (results.length > 0) {
      const narrative = results
        .map((r, i) => `[${i + 1}] ${r.title ?? r.url}\n${r.description ?? ""}${r.markdown ? "\n" + r.markdown.slice(0, 1200) : ""}`)
        .join("\n\n");
      return {
        text: narrative,
        citations: filterPlausibleUrls(results.map((r) => r.url)),
        provider: results[0].provider,
        degraded: false,
      };
    }
  }

  // 3. Lovable AI fallback — narrative ONLY, no citations
  const text = await runResearchPrompt({
    systemRole: params.systemPrompt,
    query: params.userPrompt,
  });
  return {
    text: text ?? "",
    citations: [],
    provider: "lovable",
    degraded: true,
  };
}
