/**
 * Exa semantic search client (optional). Active only when EXA_API_KEY is set.
 * Returns page-level results with highlights so callers keep real source URLs.
 */
const EXA_URL = "https://api.exa.ai/search";

export type ExaResult = { url: string; title?: string; text?: string; publishedDate?: string };

export function isExaConfigured(): boolean {
  return Boolean(Deno.env.get("EXA_API_KEY"));
}

export async function exaSearch(query: string, opts: {
  limit?: number;
  recency?: "day" | "week" | "month" | "year";
  category?: "company" | "news" | "pdf" | "linkedin profile";
} = {}): Promise<ExaResult[]> {
  const key = Deno.env.get("EXA_API_KEY");
  if (!key) return [];
  const days = { day: 1, week: 7, month: 31, year: 365 }[opts.recency ?? "year"];
  try {
    const res = await fetch(EXA_URL, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        numResults: opts.limit ?? 6,
        type: "auto",
        category: opts.category,
        startPublishedDate: new Date(Date.now() - days * 86400000).toISOString(),
        contents: { highlights: { numSentences: 4, highlightsPerUrl: 3 } },
      }),
    });
    if (!res.ok) {
      console.error(`exa ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    return (data?.results ?? []).map((r: { url: string; title?: string; highlights?: string[]; publishedDate?: string }) => ({
      url: r.url,
      title: r.title,
      text: (r.highlights ?? []).join(" … "),
      publishedDate: r.publishedDate,
    }));
  } catch (e) {
    console.error("exa error", e);
    return [];
  }
}
