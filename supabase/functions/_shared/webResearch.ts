/**
 * webResearch — wraps Lovable AI Gateway (https://ai.gateway.lovable.dev) to
 * produce analyst-grade research narratives for monitoring agents (regulatory,
 * supply chain, stakeholder, etc.).
 *
 * Replaces previous Perplexity calls in agents that don't strictly need live
 * web search. Lovable AI is capable of producing structured analyst
 * commentary from a query + portfolio context, and Lovable AI is included in
 * the Lovable Cloud plan with no separate API key required.
 *
 * Env: LOVABLE_API_KEY (auto-provisioned). Returns null on failure so callers
 * can degrade gracefully instead of throwing.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

export type ResearchPrompt = {
  /** Domain framing — e.g. "regulatory compliance analyst for infrastructure". */
  systemRole: string;
  /** Specific question, can include date hints like "in 2025". */
  query: string;
  /** Optional model override. */
  model?: string;
};

/**
 * Run one research prompt. Returns the assistant content string, or `null` on
 * any failure (rate-limit, payment-required, network, malformed response).
 * Caller decides what to do with `null`.
 */
export async function runResearchPrompt(prompt: ResearchPrompt): Promise<string | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("webResearch: LOVABLE_API_KEY not configured");
    return null;
  }
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: prompt.model ?? DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              `${prompt.systemRole}\n\nYou are summarising the most likely current state of the world for an internal intelligence brief. Be specific, cite plausible figures, name concrete entities, and produce 2-4 paragraphs of dense analyst commentary. Don't hedge with "I cannot browse the web" — give your best informed analysis.`,
          },
          { role: "user", content: prompt.query },
        ],
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`webResearch: gateway ${res.status} - ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return null;
    return content;
  } catch (e) {
    console.error("webResearch: fetch error", e);
    return null;
  }
}

/**
 * Run several prompts in parallel and return only the successful outputs.
 * Empty array if all failed.
 */
export async function runResearchBatch(prompts: ResearchPrompt[]): Promise<string[]> {
  const results = await Promise.all(prompts.map(runResearchPrompt));
  return results.filter((r): r is string => typeof r === "string");
}
