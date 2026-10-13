/**
 * Perplexity client — direct API call (not via gateway; this connector exposes
 * its API key directly as PERPLEXITY_API_KEY).
 *
 * Returns real `citations[]` grounded in live web search. This is the primary
 * fix for hallucinated source URLs.
 */

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

export type PerplexityResult = {
  text: string;
  citations: string[];
};

export function isPerplexityConfigured(): boolean {
  return Boolean(Deno.env.get("PERPLEXITY_API_KEY"));
}

export async function callPerplexity(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: "sonar" | "sonar-pro" | "sonar-reasoning";
  recency?: "day" | "week" | "month" | "year";
  domainFilter?: string[];
}): Promise<PerplexityResult | null> {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  if (!apiKey) return null;

  try {
    const res = await fetch(PERPLEXITY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model ?? "sonar",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature: 0.2,
        search_recency_filter: params.recency,
        search_domain_filter: params.domainFilter,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`perplexity ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    const citations: string[] = Array.isArray(data?.citations) ? data.citations : [];
    if (typeof text !== "string" || !text.trim()) return null;
    return { text, citations };
  } catch (e) {
    console.error("perplexity error", e);
    return null;
  }
}

/**
 * Perplexity Search API — raw ranked web results (no LLM answer).
 * POST https://api.perplexity.ai/search ; results[] {title,url,snippet,date?,last_updated?}
 * `query` may be up to 5 strings; results are deduped by URL.
 */
export type PerplexitySearchResult = { title: string; url: string; snippet: string; date?: string };

export async function perplexitySearch(query: string | string[], opts: { maxResults?: number; country?: string } = {}): Promise<PerplexitySearchResult[]> {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.perplexity.ai/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: Array.isArray(query) ? query.slice(0, 5) : query,
        max_results: Math.min(Math.max(opts.maxResults ?? 10, 1), 20),
        ...(opts.country ? { country: opts.country } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401 && body.includes("insufficient_quota")) console.error("perplexity search: API credits exhausted");
      else console.error(`perplexity search ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    // Multi-query responses return one result list per query.
    const raw = data?.results ?? [];
    const flat: PerplexitySearchResult[] = Array.isArray(raw[0]) ? raw.flat() : raw;
    const seen = new Set<string>();
    return flat.filter((r) => r?.url && !seen.has(r.url) && seen.add(r.url));
  } catch (e) {
    console.error("perplexity search error", e);
    return [];
  }
}
