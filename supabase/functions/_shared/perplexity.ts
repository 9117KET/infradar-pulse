import { runResearchPrompt } from "./webResearch.ts";

type PerplexityResearchOk = { ok: true; text: string; citations: string[] };
type PerplexityResearchFail = { ok: false; error: string; status?: number };

export async function fetchPerplexityResearch(params: {
  apiKey?: string | undefined;
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  searchRecencyFilter?: "day" | "week" | "month" | "year";
}): Promise<PerplexityResearchOk | PerplexityResearchFail> {
  // Compatibility wrapper: despite the historical name, MVP agents now route
  // research through Lovable AI only. External Perplexity/Firecrawl credits must
  // not be required for scheduled agents to complete.
  const aiText = await runResearchPrompt({
    systemRole: params.systemPrompt,
    query: `${params.userPrompt}\n\nFocus recency: ${params.searchRecencyFilter ?? "month"}.`,
  });
  if (aiText) return { ok: true, text: aiText, citations: [] };
  return { ok: false, error: `Lovable AI research failed for ${params.agentName}` };
}
