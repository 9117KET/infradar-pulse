/**
 * Lovable AI Gateway Chat Completions, with an optional OpenAI-compatible
 * fallback provider.
 *
 * Env:
 *   LOVABLE_API_KEY — auto-provisioned by Lovable Cloud
 *   LLM_MODEL or LOVABLE_AI_MODEL — optional, default google/gemini-3-flash-preview
 *   FALLBACK_LLM_API_KEY / FALLBACK_LLM_BASE_URL / FALLBACK_LLM_MODEL — optional.
 *     Used when the gateway answers 402 (credits exhausted), 403 or 429, or when
 *     LOVABLE_API_KEY is unset. Any OpenAI-compatible endpoint works, e.g.
 *     Gemini https://generativelanguage.googleapis.com/v1beta/openai (model
 *     gemini-2.5-flash), OpenRouter https://openrouter.ai/api/v1, or Groq
 *     https://api.groq.com/openai/v1. The fallback model always replaces the
 *     caller's Lovable-specific model name.
 */

type FallbackEnv = { apiKey: string; baseUrl: string; model: string };

function fallbackEnv(): FallbackEnv | null {
  const apiKey = (Deno.env.get("FALLBACK_LLM_API_KEY") ?? "").trim();
  const baseUrl = (Deno.env.get("FALLBACK_LLM_BASE_URL") ?? "").trim().replace(/\/+$/, "");
  const model = (Deno.env.get("FALLBACK_LLM_MODEL") ?? "").trim();
  return apiKey && baseUrl && model ? { apiKey, baseUrl, model } : null;
}

/** True when any chat provider (Lovable gateway or fallback) is configured. */
export function isLlmConfigured(): boolean {
  const k = Deno.env.get("LOVABLE_API_KEY") ?? "";
  return Boolean(k.trim()) || fallbackEnv() !== null;
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

/** Gateway answers that a different provider can still serve. */
const FALLBACK_STATUSES = new Set([402, 403, 429]);

/**
 * POST /v1/chat/completions with Bearer auth. Body may omit `model` to use env
 * default. Falls back to FALLBACK_LLM_* on 402/403/429 or a missing Lovable
 * key; otherwise returns the gateway response unchanged so callers' existing
 * status handling keeps working.
 */
export async function chatCompletions(body: Record<string, unknown>): Promise<Response> {
  const fallback = fallbackEnv();
  const lovableKey = (Deno.env.get("LOVABLE_API_KEY") ?? "").trim();

  if (lovableKey) {
    const { apiKey, baseUrl, model: defaultModel } = getLlmEnv();
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: body.model ?? defaultModel }),
    });
    if (!fallback || !FALLBACK_STATUSES.has(res.status)) return res;
    console.warn(`llm: Lovable gateway ${res.status}; retrying on fallback provider ${fallback.baseUrl}`);
    await res.body?.cancel();
  } else if (!fallback) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  return await fetch(`${fallback!.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fallback!.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: fallback!.model }),
  });
}
