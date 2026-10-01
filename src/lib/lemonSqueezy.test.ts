import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./lemonSqueezy');
}

describe('checkout switches', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('pre-launch: no checkout, sandbox environment', async () => {
    const m = await load({ VITE_PAYMENTS_LIVE: 'false', VITE_PAYMENTS_TEST_CHECKOUT: '', VITE_LEMONSQUEEZY_STORE_ID: '1' });
    expect(m.isLiveCheckoutEnabled()).toBe(false);
    expect(m.getLemonSqueezyEnvironment()).toBe('sandbox');
  });

  it('test checkout opens checkout but keeps the sandbox environment', async () => {
    const m = await load({ VITE_PAYMENTS_LIVE: 'false', VITE_PAYMENTS_TEST_CHECKOUT: 'true', VITE_LEMONSQUEEZY_STORE_ID: '1' });
    expect(m.isTestCheckoutEnabled()).toBe(true);
    expect(m.isLiveCheckoutEnabled()).toBe(true);
    expect(m.getLemonSqueezyEnvironment()).toBe('sandbox');
  });

  it('live ignores the test switch', async () => {
    const m = await load({ VITE_PAYMENTS_LIVE: 'true', VITE_PAYMENTS_TEST_CHECKOUT: 'true', VITE_LEMONSQUEEZY_STORE_ID: '1' });
    expect(m.isTestCheckoutEnabled()).toBe(false);
    expect(m.isLiveCheckoutEnabled()).toBe(true);
    expect(m.getLemonSqueezyEnvironment()).toBe('live');
  });

  it('no store configured: never opens checkout', async () => {
    const m = await load({ VITE_PAYMENTS_LIVE: 'true', VITE_LEMONSQUEEZY_STORE_ID: '' });
    expect(m.isLiveCheckoutEnabled()).toBe(false);
  });
});
