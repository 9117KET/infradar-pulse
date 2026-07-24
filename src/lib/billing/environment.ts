// Generic sandbox/live discriminator for the whole app (entitlement lookups,
// quota tracking, agent-call tagging) — independent of which payment
// provider is active. Tracks the same master go-live switch (VITE_PAYMENTS_LIVE)
// already used everywhere to gate real checkout.
//
// This replaces getPaddleEnvironment() as the app-wide environment tag: that
// function derived 'sandbox'/'live' from whether VITE_PAYMENTS_CLIENT_TOKEN
// started with "test_", which silently resolves to 'live' once the token is
// unset (Paddle is dormant) — exactly the wrong default for an app that
// hasn't gone live yet.
import { isPaymentsLive } from '@/lib/paddle';

export { isPaymentsLive };

export function getAppEnvironment(): 'sandbox' | 'live' {
  return isPaymentsLive() ? 'live' : 'sandbox';
}
