import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { effectivePlan, PLAN_LIMITS, PlanKey } from '@/lib/billing/limits';
import { getAppEnvironment } from '@/lib/billing/environment';
import { useAuth } from '@/contexts/AuthContext';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export type UsageMetric = 'ai_generation' | 'export_csv' | 'export_pdf' | 'insight_read';

export type SubInfo = {
  status: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type NoCardTrialInfo = {
  starts_at: string;
  ends_at: string;
  status: string;
};

export type PilotAccessInfo = NoCardTrialInfo & {
  seat_number: number | null;
};

export function useEntitlements() {
  const { user, roles, loading: authLoading, profileLoading } = useAuth();
  const userId = user?.id ?? null;
  const [plan, setPlan] = useState<PlanKey>('free');
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<Partial<Record<UsageMetric, number>>>({});
  const [hasPaymentsCustomer, setHasPaymentsCustomer] = useState(false);
  const [staffBypass, setStaffBypass] = useState(false);
  const [hasLifetime, setHasLifetime] = useState(false);
  const [subInfo, setSubInfo] = useState<SubInfo | null>(null);
  const [noCardTrial, setNoCardTrial] = useState<NoCardTrialInfo | null>(null);
  const [pilotAccess, setPilotAccess] = useState<PilotAccessInfo | null>(null);
  // Referral reward engine (live-computed server-side, see migration
  // 20260615120000_referral_bonus.sql). referralBonus = earned (+3 each, cap +30),
  // welcomeBonus = +3/day for a freshly-referred user's first 14 days.
  const [qualifiedReferrals, setQualifiedReferrals] = useState(0);
  const [pendingReferrals, setPendingReferrals] = useState(0);
  const [referralBonus, setReferralBonus] = useState(0);
  const [welcomeBonus, setWelcomeBonus] = useState(0);

  const refresh = useCallback(async () => {
    if (authLoading || profileLoading) return;
    if (!userId) {
      setPlan('free');
      setUsage({});
      setHasPaymentsCustomer(false);
      setStaffBypass(false);
      setHasLifetime(false);
      setSubInfo(null);
      setNoCardTrial(null);
      setPilotAccess(null);
      setQualifiedReferrals(0);
      setPendingReferrals(0);
      setReferralBonus(0);
      setWelcomeBonus(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const staffFromRoles = roles.includes('admin') || roles.includes('researcher');
      if (staffFromRoles) {
        setStaffBypass(true);
        setPlan('enterprise');
        setUsage({});
        setHasLifetime(false);
        setSubInfo(null);
        setNoCardTrial(null);
        setPilotAccess(null);
        setQualifiedReferrals(0);
        setPendingReferrals(0);
        setReferralBonus(0);
        setWelcomeBonus(0);
        setLoading(false);
        return;
      }

      const environment = getAppEnvironment();
      const [{ data: sub }, { data: counters }, { data: lifetime }, { data: trial }, { data: pilot }, { data: referral }] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('status, plan_key, entitlement_plan_key, entitlement_plan_until, trial_end, current_period_end, paddle_customer_id, cancel_at_period_end')
          .eq('user_id', userId)
          .eq('environment', environment)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('usage_counters')
          .select('metric, count')
          .eq('user_id', userId)
          .eq('period_start', todayUtc()),
        // Lifetime grant overrides everything below staff bypass.
        // Cast to any: lifetime_grants is a brand-new table not yet in generated types.
        (supabase as any)
          .from('lifetime_grants')
          .select('id')
          .eq('user_id', userId)
          .eq('environment', environment)
          .maybeSingle(),
        (supabase as any)
          .from('no_card_trial_grants')
          .select('starts_at, ends_at, status')
          .eq('user_id', userId)
          .eq('environment', environment)
          .eq('status', 'active')
          .gt('ends_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from('pilot_access_grants')
          .select('starts_at, ends_at, status, seat_number')
          .eq('user_id', userId)
          .eq('environment', 'live')
          .eq('status', 'active')
          .gt('ends_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Live referral summary (qualified/pending counts + earned/welcome bonus).
        // Best-effort: a failure leaves the bonus at 0, never blocks entitlements.
        (supabase as any).rpc('my_referral_summary'),
      ]);

      const ref = Array.isArray(referral) ? referral[0] : referral;
      setQualifiedReferrals(Number(ref?.qualified_count ?? 0));
      setPendingReferrals(Number(ref?.pending_count ?? 0));
      setReferralBonus(Number(ref?.ai_bonus ?? 0));
      setWelcomeBonus(Number(ref?.welcome_bonus ?? 0));

      setHasPaymentsCustomer(!!sub?.paddle_customer_id || !!sub?.ls_customer_id);
      setHasLifetime(!!lifetime);
      setNoCardTrial(trial ?? null);
      setPilotAccess(pilot ?? null);
      setSubInfo(
        sub
          ? {
              status: sub.status,
              trial_end: sub.trial_end,
              current_period_end: sub.current_period_end,
              cancel_at_period_end: !!sub.cancel_at_period_end,
            }
          : null,
      );

      const bypass = staffFromRoles;
      setStaffBypass(!!bypass);

      if (bypass) {
        setPlan('enterprise');
      } else if (lifetime) {
        // Lifetime grant = permanent Pro-tier (effectively unlimited) access.
        setPlan('lifetime');
      } else if (pilot) {
        setPlan('enterprise');
      } else if (trial) {
        setPlan('trialing');
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
  }, [authLoading, profileLoading, roles, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: refresh as soon as the webhook updates this user's subscription row.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`subscriptions:${userId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, refresh]);

  // Realtime: bump the referral bonus the moment a new referral lands.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`referral_events:${userId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'referral_events', filter: `referrer_id=eq.${userId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, refresh]);

  const limits = useMemo(() => {
    if (staffBypass) return PLAN_LIMITS.enterprise;
    return PLAN_LIMITS[plan];
  }, [plan, staffBypass]);

  // Referral bonus stacks on the DAILY AI cap for free/trialing only (mirrors
  // the server gate in entitlementCheck.ts). aiBonus = earned + welcome.
  const aiBonus = (plan === 'free' || plan === 'trialing') ? referralBonus + welcomeBonus : 0;
  const effectiveAiPerDay = limits.aiPerDay + aiBonus;

  const canUseAi = staffBypass || (usage.ai_generation ?? 0) < effectiveAiPerDay;
  const canExportCsv = staffBypass || (usage.export_csv ?? 0) < limits.exportsPerDay;
  const canExportPdf = staffBypass || (usage.export_pdf ?? 0) < limits.exportsPerDay;
  const canReadInsightFull = staffBypass || (usage.insight_read ?? 0) < limits.insightReadsPerDay;

  /** True when the user is on the unpaid free tier (not staff). Used for discovery / upgrade copy. */
  const isFreeTier = !staffBypass && plan === 'free';

  return {
    loading,
    plan,
    /** Display name for the plan. Pilot users get enterprise-tier limits but signed up for a "Pro pilot", so label it that way. */
    planLabel: !staffBypass && pilotAccess ? 'Pro pilot' : plan,
    limits,
    usage,
    staffBypass,
    hasPaymentsCustomer,
    hasLifetime,
    noCardTrial,
    pilotAccess,
    isFreeTier,
    /** True when no user is signed in. Used to skip per-user caps on public pages. */
    isAnonymous: !userId,
    subInfo,
    // Referral reward surface for dashboards / nudges.
    qualifiedReferrals,
    pendingReferrals,
    /** Bonus daily AI quota earned by referring others (+3 each, cap +30). */
    referralBonus,
    /** Two-sided welcome bonus (+3/day) while the user is in their first 14 days as a referred user. */
    welcomeBonus,
    /** Effective daily AI cap = plan aiPerDay + applicable referral bonus. */
    effectiveAiPerDay,
    refresh,
    canUseAi,
    canExportCsv,
    canExportPdf,
    canReadInsightFull,
  };
}
