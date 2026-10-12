// Generic sandbox/live discriminator for the whole app (entitlement lookups,
// quota tracking, agent-call tagging) — independent of which payment
// provider is active. Tracks the same master go-live switch (VITE_PAYMENTS_LIVE)
// already used everywhere to gate real checkout.

/**
 * Master switch for whether we actually charge yet. While false (pre-launch),
 * Upgrade/Choose-plan CTAs open the founding-access modal instead of a real
 * checkout. Flip VITE_PAYMENTS_LIVE to 'true' to go live.
 */
export function isPaymentsLive(): boolean {
  return (import.meta.env.VITE_PAYMENTS_LIVE as string | undefined) === 'true';
}

export function getAppEnvironment(): 'sandbox' | 'live' {
  return isPaymentsLive() ? 'live' : 'sandbox';
}
