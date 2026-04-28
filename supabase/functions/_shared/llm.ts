/**
 * Lovable AI Gateway Chat Completions.
 *
 * Env:
 *   LOVABLE_API_KEY — auto-provisioned by Lovable Cloud
 *   LLM_MODEL or LOVABLE_AI_MODEL — optional, default google/gemini-3-flash-preview
 */

/** True when an OpenAI-compatible API key is set (for optional AI branches). */
export function isLlmConfigured(): boolean {
  const k = Deno.env.get("LOVABLE_API_KEY") ?? "";
  return Boolean(k.trim());
}

export function getLlmEnv(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY not configured");
  }
  const baseUrl = "https://ai.gateway.lovable.dev/v1";
  const model = Deno.env.get("LLM_MODEL") ?? Deno.env.get("LOVABLE_AI_MODEL") ?? "google/gemini-3-flash-preview";
  return { apiKey, baseUrl, model };
}

/** POST /v1/chat/completions with Bearer auth. Body may omit `model` to use env default. */
export async function chatCompletions(body: Record<string, unknown>): Promise<Response> {
  const { apiKey, baseUrl, model: defaultModel } = getLlmEnv();
  const payload = { ...body, model: body.model ?? defaultModel };
  return await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
