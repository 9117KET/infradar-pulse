/**
 * OpenAI-compatible Chat Completions (OpenAI, Azure OpenAI, LiteLLM, local gateways).
 *
 * Env:
 *   OPENAI_API_KEY or LLM_API_KEY — required
 *   OPENAI_BASE_URL — optional, default https://api.openai.com/v1
 *   LLM_MODEL or OPENAI_MODEL — optional, default gpt-4o-mini
 */

/** True when an OpenAI-compatible API key is set (for optional AI branches). */
export function isLlmConfigured(): boolean {
  const k = Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("LLM_API_KEY") ?? "";
  return Boolean(k.trim());
}

export function getLlmEnv(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("LLM_API_KEY") ?? "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or LLM_API_KEY not configured");
  }
  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = Deno.env.get("LLM_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
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
