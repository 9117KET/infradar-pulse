import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { effectivePlan, PLAN_LIMITS, PlanKey } from '@/lib/billing/limits';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export type UsageMetric = 'ai_generation' | 'export_csv' | 'export_pdf' | 'insight_read';

export function useEntitlements() {
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanKey>('free');
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<Partial<Record<UsageMetric, number>>>({});
  const [hasPaddleCustomer, setHasPaddleCustomer] = useState(false);
  const [staffBypass, setStaffBypass] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      setPlan('free');
      setUsage({});
      setHasPaddleCustomer(false);
      setStaffBypass(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: sub }, { data: counters }, { data: roleRow }] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('status, plan_key, trial_end, current_period_end, paddle_customer_id')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('usage_counters')
          .select('metric, count')
          .eq('user_id', userId)
          .eq('period_start', todayUtc()),
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      ]);

      setHasPaddleCustomer(!!sub?.paddle_customer_id);

      const bypass = roleRow?.role === 'admin' || roleRow?.role === 'researcher';
      setStaffBypass(!!bypass);

      if (bypass) {
        setPlan('enterprise');
      } else {
        setPlan(effectivePlan(sub));
      }

      const map: Partial<Record<UsageMetric, number>> = {};
      (counters || []).forEach((r: { metric: string; count: number }) => {
        if (r.metric === 'ai_generation' || r.metric === 'export_csv' || r.metric === 'export_pdf' || r.metric === 'insight_read') {
          map[r.metric] = r.count;
        }
      });
      setUsage(map);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const limits = useMemo(() => {
    if (staffBypass) return PLAN_LIMITS.enterprise;
    return PLAN_LIMITS[plan];
  }, [plan, staffBypass]);

  const canUseAi = staffBypass || (usage.ai_generation ?? 0) < limits.aiPerDay;
  const canExportCsv = staffBypass || (usage.export_csv ?? 0) < limits.exportsPerDay;
  const canExportPdf = staffBypass || (usage.export_pdf ?? 0) < limits.exportsPerDay;
  const canReadInsightFull = staffBypass || (usage.insight_read ?? 0) < limits.insightReadsPerDay;

  /** True when the user is on the unpaid free tier (not staff). Used for discovery / upgrade copy. */
  const isFreeTier = !staffBypass && plan === 'free';

  return {
    loading,
    plan,
    limits,
    usage,
    staffBypass,
    hasPaddleCustomer,
    isFreeTier,
    refresh,
    canUseAi,
    canExportCsv,
    canExportPdf,
    canReadInsightFull,
  };
}
