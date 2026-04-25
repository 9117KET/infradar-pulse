// After Paddle checkout completes, the webhook lands a few seconds later.
// This hook polls the subscriptions table until either:
//   - a subscription with status in (trialing | active | past_due) appears
//   - the timeout elapses (TIMEOUT_MS)
// It exposes a state machine the BillingTab can render as a progress UI.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPaddleEnvironment } from '@/lib/paddle';

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 30_000;

export type CheckoutPollStatus = 'idle' | 'polling' | 'ready' | 'timeout';

export type UseCheckoutCompletionResult = {
  status: CheckoutPollStatus;
  /** Seconds elapsed since polling started — used for the progress bar. */
  elapsedSec: number;
  /** Begin polling. Safe to call multiple times — only one poll runs at a time. */
  start: () => void;
  /** Reset back to idle (e.g. after the user dismisses the progress UI). */
  reset: () => void;
};

export function useCheckoutCompletion(
  userId: string | null | undefined,
  onReady?: () => void | Promise<void>,
): UseCheckoutCompletionResult {
  const [status, setStatus] = useState<CheckoutPollStatus>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onReadyRef = useRef(onReady);

  // Keep the callback ref fresh without re-creating the interval.
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startedAtRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    setStatus('idle');
    setElapsedSec(0);
  }, [stop]);

  const start = useCallback(() => {
    if (!userId) return;
    if (intervalRef.current) return; // already polling
    setStatus('polling');
    setElapsedSec(0);
    startedAtRef.current = Date.now();

    intervalRef.current = setInterval(async () => {
      if (!startedAtRef.current) return;
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedSec(Math.floor(elapsed / 1000));

      // Look for the row the webhook will write in the active payment environment.
      const { data } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .eq('environment', getPaddleEnvironment())
        .in('status', ['trialing', 'active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        stop();
        setStatus('ready');
        try {
          await onReadyRef.current?.();
        } catch (e) {
          console.warn('checkout completion onReady handler failed:', e);
        }
        return;
      }

      if (elapsed >= TIMEOUT_MS) {
        stop();
        setStatus('timeout');
      }
    }, POLL_INTERVAL_MS);
  }, [userId, stop]);

  // Cleanup on unmount.
  useEffect(() => () => stop(), [stop]);

  return { status, elapsedSec, start, reset };
}
