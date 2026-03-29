import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PLAN_LIMITS, PlanKey } from "./billing.ts";

export type Metric = "ai_generation" | "export_csv" | "export_pdf" | "insight_read";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function effectivePlan(
  status: string | null | undefined,
  planKey: string | null | undefined,
  trialEnd: string | null | undefined,
  periodEnd: string | null | undefined
): PlanKey {
  const now = Date.now();
  if (status === "trialing") return "trialing";
  if (status === "active" || status === "past_due") {
    const pk = (planKey || "starter") as PlanKey;
    if (pk in PLAN_LIMITS && pk !== "free" && pk !== "trialing") return pk;
    return "starter";
  }
  if (trialEnd && new Date(trialEnd).getTime() > now) return "trialing";
  if (periodEnd && new Date(periodEnd).getTime() > now && status && ["canceled", "unpaid"].includes(status)) {
    const pk = (planKey || "free") as PlanKey;
    if (pk in PLAN_LIMITS) return pk;
  }
  return "free";
}

export async function hasStaffBypass(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = data?.role;
  return role === "admin" || role === "researcher";
}

export async function getEntitlementForUser(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ plan: PlanKey; limits: (typeof PLAN_LIMITS)[PlanKey]; bypass: boolean }> {
  const bypass = await hasStaffBypass(supabaseAdmin, userId);
  if (bypass) {
    return { plan: "enterprise", limits: PLAN_LIMITS.enterprise, bypass: true };
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plan_key, trial_end, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  const plan = effectivePlan(sub?.status, sub?.plan_key, sub?.trial_end, sub?.current_period_end);
  return { plan, limits: PLAN_LIMITS[plan], bypass: false };
}

export async function getUsageCount(
  supabaseAdmin: SupabaseClient,
  userId: string,
  metric: Metric
): Promise<number> {
  const day = todayUtc();
  const { data } = await supabaseAdmin
    .from("usage_counters")
    .select("count")
    .eq("user_id", userId)
    .eq("metric", metric)
    .eq("period_start", day)
    .maybeSingle();
  return data?.count ?? 0;
}

export async function assertAiAllowed(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string; plan: PlanKey }> {
  const ent = await getEntitlementForUser(supabaseAdmin, userId);
  if (ent.bypass) return { ok: true };
  const used = await getUsageCount(supabaseAdmin, userId, "ai_generation");
  if (used >= ent.limits.aiPerDay) {
    return {
      ok: false,
      message: `Daily AI generation limit reached (${ent.limits.aiPerDay}/day for ${ent.plan} plan). Upgrade or try again tomorrow.`,
      plan: ent.plan,
    };
  }
  return { ok: true };
}

export async function assertExportAllowed(
  supabaseAdmin: SupabaseClient,
  userId: string,
  kind: "csv" | "pdf"
): Promise<{ ok: true } | { ok: false; message: string; plan: PlanKey }> {
  const ent = await getEntitlementForUser(supabaseAdmin, userId);
  if (ent.bypass) return { ok: true };
  const metric = kind === "csv" ? "export_csv" : "export_pdf";
  const used = await getUsageCount(supabaseAdmin, userId, metric);
  const cap = ent.limits.exportsPerDay;
  if (used >= cap) {
    return {
      ok: false,
      message: `Daily ${kind.toUpperCase()} export limit reached (${cap}/day). Upgrade for higher limits.`,
      plan: ent.plan,
    };
  }
  return { ok: true };
}

export async function assertInsightReadAllowed(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string; plan: PlanKey }> {
  const ent = await getEntitlementForUser(supabaseAdmin, userId);
  if (ent.bypass) return { ok: true };
  const used = await getUsageCount(supabaseAdmin, userId, "insight_read");
  if (used >= ent.limits.insightReadsPerDay) {
    return {
      ok: false,
      message: `Daily full insight read limit reached (${ent.limits.insightReadsPerDay}/day). Upgrade to read more.`,
      plan: ent.plan,
    };
  }
  return { ok: true };
}

export async function incrementUsage(
  supabaseAdmin: SupabaseClient,
  userId: string,
  metric: Metric
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("increment_usage_for_user", {
    p_user_id: userId,
    p_metric: metric,
  });
  if (error) throw error;
}
