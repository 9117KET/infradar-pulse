import { runResearchPrompt } from "./webResearch.ts";

type AgentResearchOk = { ok: true; text: string; citations: string[] };
type AgentResearchFail = { ok: false; error: string; status?: number };

export async function fetchAgentResearch(params: {
  apiKey?: string | undefined;
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  searchRecencyFilter?: "day" | "week" | "month" | "year";
}): Promise<AgentResearchOk | AgentResearchFail> {
  // Compatibility wrapper: despite the historical import path, MVP agents now route
  // research through Lovable AI only. External Perplexity/Firecrawl credits must
  // not be required for scheduled agents to complete.
  const aiText = await runResearchPrompt({
    systemRole: params.systemPrompt,
    query: `${params.userPrompt}\n\nFocus recency: ${params.searchRecencyFilter ?? "month"}.`,
  });
  if (aiText) return { ok: true, text: aiText, citations: [] };
  return { ok: false, error: `Lovable AI research failed for ${params.agentName}` };
}
