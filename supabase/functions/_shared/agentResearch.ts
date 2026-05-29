/**
 * Agent research helper. Routes through researchRouter so we get REAL
 * citations from Perplexity / Firecrawl instead of an empty array.
 */

import { research } from "./researchRouter.ts";

type AgentResearchOk = { ok: true; text: string; citations: string[] };
type AgentResearchFail = { ok: false; error: string; status?: number };

export async function fetchAgentResearch(params: {
  apiKey?: string | undefined;
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  searchRecencyFilter?: "day" | "week" | "month" | "year";
}): Promise<AgentResearchOk | AgentResearchFail> {
  const r = await research({
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    mode: "monitoring",
    recency: params.searchRecencyFilter,
  });
  if (!r.text) {
    return { ok: false, error: `All providers failed for ${params.agentName}` };
  }
  // When degraded (Lovable AI fallback) we intentionally return empty
  // citations so callers do not persist any source URLs.
  return { ok: true, text: r.text, citations: r.citations };
}
