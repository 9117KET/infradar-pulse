/**
 * Scheduler authentication that survives project key rotation.
 *
 * Every pg_cron job sends BOTH:
 *   Authorization: Bearer <service-role key from vault>   (gateway/verify_jwt)
 *   x-cron-secret: <AGENT_CRON_SECRET>                    (application layer)
 *
 * The service-role key is rotated by the platform; the cron secret is not.
 * Checking the cron secret means a key rotation can no longer silence every
 * agent (the 2026-07-22 outage). Keep both: the bearer is still what gets a
 * request past `verify_jwt = true` functions.
 */

/** Length-safe, non-short-circuiting comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the request carries the shared scheduler secret. */
export function isCronRequest(req: Request): boolean {
  const expected = Deno.env.get("AGENT_CRON_SECRET") ?? "";
  if (!expected) return false;
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}
