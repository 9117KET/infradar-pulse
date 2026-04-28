type PerplexityResearchOk = { ok: true; text: string; citations: string[] };
type PerplexityResearchFail = { ok: false; error: string; status?: number };

export async function fetchPerplexityResearch(params: {
  apiKey: string | undefined;
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  searchRecencyFilter?: "day" | "week" | "month" | "year";
}): Promise<PerplexityResearchOk | PerplexityResearchFail> {
  const apiKey = params.apiKey?.trim();
  if (!apiKey) return { ok: false, error: "PERPLEXITY_API_KEY not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        search_recency_filter: params.searchRecencyFilter ?? "month",
      }),
    });

    const textBody = await res.text();
    let data: any = null;
    try { data = textBody ? JSON.parse(textBody) : null; } catch { /* keep raw body for diagnostics */ }

    if (!res.ok) {
      const message = data?.error?.message || data?.message || textBody.slice(0, 240) || "Perplexity request failed";
      console.error(`${params.agentName} Perplexity request failed`, { status: res.status, message });
      const fallback = await fetchFirecrawlFallback(params.agentName, params.userPrompt);
      if (fallback.ok) return fallback;
      return { ok: false, status: res.status, error: `Perplexity request failed (${res.status}): ${message}${fallback.error ? `; Firecrawl fallback failed: ${fallback.error}` : ""}` };
    }

    const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!content) {
      console.error(`${params.agentName} Perplexity returned no content`, { hasChoices: Array.isArray(data?.choices), citations: data?.citations?.length ?? 0 });
      const fallback = await fetchFirecrawlFallback(params.agentName, params.userPrompt);
      if (fallback.ok) return fallback;
      return { ok: false, error: `Perplexity returned no research text${fallback.error ? `; Firecrawl fallback failed: ${fallback.error}` : ""}` };
    }

    return { ok: true, text: content, citations: Array.isArray(data?.citations) ? data.citations : [] };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown Perplexity error";
    console.error(`${params.agentName} Perplexity exception`, { message });
    const fallback = await fetchFirecrawlFallback(params.agentName, params.userPrompt);
    if (fallback.ok) return fallback;
    return { ok: false, error: `${message}${fallback.error ? `; Firecrawl fallback failed: ${fallback.error}` : ""}` };
  } finally {
    clearTimeout(timeout);
  }
}


async function fetchFirecrawlFallback(agentName: string, query: string): Promise<PerplexityResearchOk | PerplexityResearchFail> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY")?.trim();
  if (!apiKey) return { ok: false, error: "FIRECRAWL_API_KEY not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
    });
    const textBody = await res.text();
    let data: any = null;
    try { data = textBody ? JSON.parse(textBody) : null; } catch { /* keep raw body */ }
    if (!res.ok) {
      const message = data?.error || data?.message || textBody.slice(0, 200) || "Firecrawl request failed";
      console.error(`${agentName} Firecrawl fallback failed`, { status: res.status, message });
      return { ok: false, status: res.status, error: message };
    }
    const rows = Array.isArray(data?.data) ? data.data : [];
    const snippets = rows
      .map((r: any) => {
        const url = String(r.url || r.link || "").trim();
        const title = String(r.title || "Untitled source").trim();
        const body = String(r.markdown || r.description || r.snippet || "").trim();
        return body ? `Source: ${url}
Title: ${title}
${body.slice(0, 2400)}` : "";
      })
      .filter(Boolean);
    if (!snippets.length) return { ok: false, error: "Firecrawl returned no research text" };
    return { ok: true, text: snippets.join("

"), citations: rows.map((r: any) => r.url).filter(Boolean) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown Firecrawl error";
    console.error(`${agentName} Firecrawl fallback exception`, { message });
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
