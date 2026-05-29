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
