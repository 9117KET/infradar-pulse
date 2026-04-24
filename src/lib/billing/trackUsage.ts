/**
 * Server-gated usage tracking. Calls the `usage-track` edge function which
 * enforces plan limits and atomically increments the counter (daily + hourly).
 *
 * Use this instead of calling the `increment_usage_metric` RPC directly so
 * limits cannot be bypassed by a tampered client.
 */
import { supabase } from '@/integrations/supabase/client';
import { getPaddleEnvironment } from '@/lib/paddle';

export type TrackAction = 'export_csv' | 'export_pdf' | 'insight_read';

export type TrackResult = {
  ok: boolean;
  message: string;
  overLimit: boolean;
  /** Which dimension was exceeded when overLimit=true. */
  reason?: 'daily' | 'hourly';
  /** True when the user must confirm their email before using the feature. */
  emailUnverified?: boolean;
};

type ErrorCtx = {
  error?: string;
  code?: string;
  reason?: 'daily' | 'hourly';
};

export async function trackUsage(action: TrackAction): Promise<TrackResult> {
  const { data, error } = await supabase.functions.invoke('usage-track', {
    body: { action, environment: getPaddleEnvironment() },
  });
  if (error) {
    const ctx = (error as { context?: ErrorCtx }).context;
    if (ctx?.code === 'ENTITLEMENT' || ctx?.code === 'EMAIL_UNVERIFIED' || ctx?.error) {
      return {
        ok: false,
        message: ctx.error ?? error.message,
        overLimit: ctx.code === 'ENTITLEMENT',
        emailUnverified: ctx.code === 'EMAIL_UNVERIFIED',
        reason: ctx.reason,
      };
    }
    return { ok: false, message: error.message, overLimit: false };
  }
  if (data?.error) {
    return {
      ok: false,
      message: data.error,
      overLimit: data.code === 'ENTITLEMENT',
      emailUnverified: data.code === 'EMAIL_UNVERIFIED',
      reason: data.reason,
    };
  }
  return { ok: true, message: '', overLimit: false };
}
