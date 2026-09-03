/**
 * researchRouter — picks the right provider for a research query and returns
 * BOTH narrative text and grounded citations.
 *
 * Routing:
 *   monitoring  → Perplexity sonar       (fallback: Firecrawl search)
 *   deep        → Perplexity sonar-pro   (fallback: Firecrawl search + scrape)
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

import { callPerplexity, isPerplexityConfigured } from "./perplexityClient.ts";
import { firecrawlSearch, isFirecrawlConfigured } from "./firecrawlClient.ts";
import { runResearchPrompt } from "./webResearch.ts";
import { filterPlausibleUrls } from "./urlHygiene.ts";

export type ResearchMode = "monitoring" | "deep" | "extraction";

export type ResearchResult = {
  text: string;
  citations: string[];
  provider: "perplexity" | "firecrawl" | "lovable";
  degraded: boolean;
};

const DEFAULT_PROVIDER = "firecrawl";

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
  const tryFirecrawl = pref === "auto" || pref === "firecrawl";

  // 1. Perplexity (grounded citations in a single call)
  if (tryPerplexity && isPerplexityConfigured() && pref !== "firecrawl" && pref !== "lovable") {
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

  // 2. Firecrawl search (+ scrape for deep research)
  if (tryFirecrawl && isFirecrawlConfigured() && pref !== "lovable") {
    const results = await firecrawlSearch(params.userPrompt, {
      limit: mode === "deep" ? 6 : 4,
      scrape: mode === "deep",
    });
    if (results.length > 0) {
      const narrative = results
        .map((r, i) => `[${i + 1}] ${r.title ?? r.url}\n${r.description ?? ""}${r.markdown ? "\n" + r.markdown.slice(0, 1200) : ""}`)
        .join("\n\n");
      return {
        text: narrative,
        citations: filterPlausibleUrls(results.map((r) => r.url)),
        provider: "firecrawl",
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
