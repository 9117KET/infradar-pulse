// Paddle.js loader + price resolver. Used by the checkout hook. The client token
// is injected at build time (.env.development = sandbox, .env.production = live).
import { supabase } from '@/integrations/supabase/client';

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

declare global {
  interface Window {
    // deno-lint-ignore no-explicit-any
    Paddle: any;
  }
}

let paddleInitialized = false;

export function isPaddleConfigured(): boolean {
  return !!clientToken;
}

export function getPaddleEnvironment(): 'sandbox' | 'live' {
  return clientToken?.startsWith('test_') ? 'sandbox' : 'live';
}

export function isLiveCheckoutEnabled(): boolean {
  return getPaddleEnvironment() === 'sandbox';
}

export async function initializePaddle(): Promise<void> {
  if (paddleInitialized) return;
  if (!clientToken) throw new Error('Payments are not configured yet.');

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-paddle="true"]');
    const onReady = () => {
      const environment = clientToken.startsWith('test_') ? 'sandbox' : 'production';
      window.Paddle.Environment.set(environment);
      window.Paddle.Initialize({ token: clientToken });
      paddleInitialized = true;
      resolve();
    };
    if (existing) {
      onReady();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.dataset.paddle = 'true';
    script.onload = onReady;
    script.onerror = () => reject(new Error('Failed to load Paddle.js'));
    document.head.appendChild(script);
  });
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  const environment = getPaddleEnvironment();
  const { data, error } = await supabase.functions.invoke('get-paddle-price', {
    body: { priceId, environment },
  });
  if (error || !data?.paddleId) {
    throw new Error(`Could not resolve price "${priceId}"`);
  }
  return data.paddleId as string;
}
