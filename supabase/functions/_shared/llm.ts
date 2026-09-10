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

/**
 * A non-OK response from the AI gateway, classified per gateway error semantics.
 * 402 / 403 / 429 are owner-actionable or transient: agents should end the run
 * gracefully with a clear reason instead of throwing an opaque 500 every tick.
 */
export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GatewayError";
  }
  /** True when retrying now cannot help and the run should end cleanly. */
  get endRunGracefully(): boolean {
    return this.status === 402 || this.status === 403 || this.status === 429;
  }
}

/** Build a GatewayError from a failed gateway response (consumes the body). */
export async function gatewayFailure(res: Response, context: string): Promise<GatewayError> {
  const text = await res.text().catch(() => "");
  let msg = text.slice(0, 300);
  try {
    const j = JSON.parse(text);
    msg = j?.message ?? j?.error?.message ?? msg;
  } catch { /* keep raw text */ }
  if (res.status === 402) msg = "Lovable AI credits exhausted — add credits to resume AI agents.";
  else if (res.status === 403) msg = "Lovable AI is blocked by workspace policy or the API key is no longer valid.";
  else if (res.status === 429) msg = "Lovable AI rate limit reached; the next scheduled run will retry.";
  return new GatewayError(res.status, `${context}: ${msg}`);
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
