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
      return { ok: false, status: res.status, error: `Perplexity request failed (${res.status}): ${message}` };
    }

    const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!content) {
      console.error(`${params.agentName} Perplexity returned no content`, { hasChoices: Array.isArray(data?.choices), citations: data?.citations?.length ?? 0 });
      return { ok: false, error: "Perplexity returned no research text" };
    }

    return { ok: true, text: content, citations: Array.isArray(data?.citations) ? data.citations : [] };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown Perplexity error";
    console.error(`${params.agentName} Perplexity exception`, { message });
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
