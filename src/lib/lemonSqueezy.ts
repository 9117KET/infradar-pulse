// Lemon.js loader + checkout opener. Used by the checkout hook.
//
// Environment model: one Lemon Squeezy store (not a separate sandbox/live
// account pair like Paddle). Whether we're in "test mode" tracks the same
// master go-live switch (VITE_PAYMENTS_LIVE) already used across the app —
// while false (pre-launch / still validating), we're in test mode; flip it
// once the store itself is taken out of Lemon Squeezy's dashboard test mode.
import { isPaymentsLive, getAppEnvironment } from '@/lib/billing/environment';

export { isPaymentsLive };

const storeId = import.meta.env.VITE_LEMONSQUEEZY_STORE_ID as string | undefined;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LemonSqueezy: any;
    createLemonSqueezy?: () => void;
  }
}

let lemonSqueezyInitialized = false;

export function isLemonSqueezyConfigured(): boolean {
  return !!storeId;
}

export function getLemonSqueezyEnvironment(): 'sandbox' | 'live' {
  return getAppEnvironment();
}

export function isLiveCheckoutEnabled(): boolean {
  return getLemonSqueezyEnvironment() === 'sandbox';
}

export async function initializeLemonSqueezy(): Promise<void> {
  if (lemonSqueezyInitialized) return;
  if (!storeId) throw new Error('Payments are not configured yet.');

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-lemonsqueezy="true"]');
    const onReady = () => {
      window.createLemonSqueezy?.();
      lemonSqueezyInitialized = true;
      resolve();
    };
    if (existing) {
      onReady();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://assets.lemonsqueezy.com/lemon.js';
    script.dataset.lemonsqueezy = 'true';
    script.defer = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('Failed to load Lemon.js'));
    document.head.appendChild(script);
  });
}

export function openLemonSqueezyCheckout(url: string): void {
  window.LemonSqueezy.Url.Open(url);
}
