/**
 * Server-gated usage tracking. Calls the `usage-track` edge function which
 * enforces plan limits and atomically increments the counter.
 *
 * Use this instead of calling the `increment_usage_metric` RPC directly so
 * limits cannot be bypassed by a tampered client.
 */
import { supabase } from '@/integrations/supabase/client';

export type TrackAction = 'export_csv' | 'export_pdf' | 'insight_read';

export type TrackResult = {
  ok: boolean;
  message: string;
  overLimit: boolean;
};

export async function trackUsage(action: TrackAction): Promise<TrackResult> {
  const { data, error } = await supabase.functions.invoke('usage-track', {
    body: { action },
  });
  if (error) {
    const ctx = (error as { context?: { error?: string; code?: string } }).context;
    if (ctx?.code === 'ENTITLEMENT' || ctx?.error) {
      return {
        ok: false,
        message: ctx.error ?? error.message,
        overLimit: ctx.code === 'ENTITLEMENT',
      };
    }
    return { ok: false, message: error.message, overLimit: false };
  }
  if (data?.error) {
    return {
      ok: false,
      message: data.error,
      overLimit: data.code === 'ENTITLEMENT',
    };
  }
  return { ok: true, message: '', overLimit: false };
}
