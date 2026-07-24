// Lemon Squeezy API client + webhook verification. Unlike Paddle there is no
// Lovable connector gateway and no official Deno SDK, so this hand-rolls both
// a thin REST wrapper (direct to api.lemonsqueezy.com) and HMAC-SHA256 webhook
// verification via crypto.subtle.
//
// Environment model: one Lemon Squeezy store, not a separate sandbox/live
// account pair like Paddle. "Test mode" is a per-store toggle, and every
// webhook payload stamps `data.attributes.test_mode` (boolean) on the
// resource — we derive our local 'sandbox' | 'live' environment string from
// that flag rather than from a query param.
const API_BASE = 'https://api.lemonsqueezy.com/v1';

export type LsEnv = 'sandbox' | 'live';

export function lsEnvFromTestMode(testMode: boolean | null | undefined): LsEnv {
  return testMode ? 'sandbox' : 'live';
}

export function getApiKey(): string {
  return Deno.env.get('LEMONSQUEEZY_API_KEY')!;
}

export function getStoreId(): string {
  return Deno.env.get('LEMONSQUEEZY_STORE_ID')!;
}

export async function lsFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${getApiKey()}`,
      ...init?.headers,
    },
  });
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Verifies the `X-Signature` header (HMAC-SHA256 over the raw request body,
 * hex-encoded) and returns the parsed webhook payload. Throws on any
 * missing/invalid signature so the caller can fail the request with 400.
 */
export async function verifyWebhook(req: Request): Promise<{
  meta: { event_name: string; custom_data?: Record<string, unknown> };
  data: { type: string; id: string; attributes: Record<string, unknown> };
}> {
  const signature = req.headers.get('x-signature');
  const body = await req.text();
  const secret = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET')!;

  if (!signature || !body) {
    throw new Error('Missing signature or body');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = toHex(mac);

  if (!timingSafeEqual(expected, signature)) {
    throw new Error('Invalid signature');
  }

  return JSON.parse(body);
}
