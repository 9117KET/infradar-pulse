import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PLAN_LIMITS, PlanKey, PlanLimit } from "./billing.ts";

export type Metric = "ai_generation" | "export_csv" | "export_pdf" | "insight_read";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns ok=true when the user's email is verified. Staff (admin/researcher)
 * bypass this check. Block AI/export/insight-read for unverified accounts so
 * people can't sign up with throwaway emails to multiply free-tier quota.
 */
export async function requireVerifiedEmail(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (await hasStaffBypass(supabaseAdmin, userId)) return { ok: true };
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return { ok: false, message: "Could not verify your account. Please sign in again." };
  }
  if (!data.user.email_confirmed_at) {
    return {
      ok: false,
      message:
        "Please confirm your email address before using this feature. Check your inbox for the verification link.",
    };
  }
  return { ok: true };
}

function effectivePlan(
  status: string | null | undefined,
  planKey: string | null | undefined,
  trialEnd: string | null | undefined,
  periodEnd: string | null | undefined,
  entitlementPlanKey?: string | null,
  entitlementPlanUntil?: string | null
): PlanKey {
  const now = Date.now();
  if (entitlementPlanKey && entitlementPlanUntil && new Date(entitlementPlanUntil).getTime() > now) {
    const pk = entitlementPlanKey as PlanKey;
    if (pk in PLAN_LIMITS) return pk;
  }
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
  userId: string,
  environment: "sandbox" | "live" = "live"
): Promise<{ plan: PlanKey; limits: PlanLimit; bypass: boolean }> {
  const bypass = await hasStaffBypass(supabaseAdmin, userId);
  if (bypass) {
    return { plan: "enterprise", limits: PLAN_LIMITS.enterprise, bypass: true };
  }

  // Lifetime grants take precedence over normal subscription state.
  const { data: lifetime } = await supabaseAdmin
    .from("lifetime_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("environment", environment)
    .maybeSingle();
  if (lifetime) {
    return { plan: "lifetime", limits: PLAN_LIMITS.lifetime, bypass: false };
  }

  const { data: pilotAccess } = await supabaseAdmin
    .from("pilot_access_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("environment", "live")
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .maybeSingle();
  if (pilotAccess) {
    return { plan: "enterprise", limits: PLAN_LIMITS.enterprise, bypass: false };
  }

  const { data: noCardTrial } = await supabaseAdmin
    .from("no_card_trial_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("environment", environment)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .maybeSingle();
  if (noCardTrial) {
    return { plan: "trialing", limits: PLAN_LIMITS.trialing, bypass: false };
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plan_key, trial_end, current_period_end, entitlement_plan_key, entitlement_plan_until")
    .eq("user_id", userId)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = effectivePlan(sub?.status, sub?.plan_key, sub?.trial_end, sub?.current_period_end, sub?.entitlement_plan_key, sub?.entitlement_plan_until);
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

/**
 * Atomically consume one unit of quota for a metric. Enforces both daily and
 * hourly caps in a single transaction via the consume_quota RPC, which
 * prevents N parallel requests from all sneaking through under the cap.
 *
 * Returns ok=true on success. On failure, returns ok=false with a friendly
 * message and the dimension that was exceeded ('daily' | 'hourly').
 */
async function tryConsume(
  supabaseAdmin: SupabaseClient,
  userId: string,
  metric: Metric,
  dailyCap: number,
  hourlyCap: number,
  plan: PlanKey,
  humanLabel: string
): Promise<{ ok: true } | { ok: false; message: string; plan: PlanKey; reason: "daily" | "hourly" }> {
  const { data, error } = await supabaseAdmin.rpc("try_consume_quota", {
    p_user_id: userId,
    p_metric: metric,
    p_daily_cap: dailyCap,
    p_hourly_cap: hourlyCap,
  });
  if (error) {
    // Fail closed: if RPC errors, assume not allowed but log.
    console.error("try_consume_quota error", error);
    return { ok: false, message: "Quota check failed. Please try again.", plan, reason: "daily" };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    if (row?.reason === "hourly") {
      return {
        ok: false,
        message: `Hourly ${humanLabel} burst limit reached (${hourlyCap}/hour for ${plan} plan). Try again in a few minutes or upgrade.`,
        plan,
        reason: "hourly",
      };
    }
    return {
      ok: false,
      message: `Daily ${humanLabel} limit reached (${dailyCap}/day for ${plan} plan). Upgrade or try again tomorrow.`,
      plan,
      reason: "daily",
    };
  }
  return { ok: true };
}

/**
 * Atomic AI gate: checks AND increments in one go. Replaces the old
 * pattern of assertAiAllowed + later incrementUsage which was racey.
 *
 * Use this at the top of AI edge functions. If it returns ok=false,
 * return 402 immediately. If ok=true, the quota is already consumed.
 */
export async function consumeAiQuota(
  supabaseAdmin: SupabaseClient,
  userId: string,
  environment: "sandbox" | "live" = "live"
): Promise<{ ok: true } | { ok: false; message: string; plan: PlanKey; reason: "daily" | "hourly" }> {
  const ent = await getEntitlementForUser(supabaseAdmin, userId, environment);
  if (ent.bypass) return { ok: true };
  return tryConsume(
    supabaseAdmin,
    userId,
    "ai_generation",
    ent.limits.aiPerDay,
    ent.limits.aiPerHour,
    ent.plan,
    "AI generation"
  );
}

export async function consumeExportQuota(
  supabaseAdmin: SupabaseClient,
  userId: string,
  kind: "csv" | "pdf",
  environment: "sandbox" | "live" = "live"
): Promise<{ ok: true } | { ok: false; message: string; plan: PlanKey; reason: "daily" | "hourly" }> {
  const ent = await getEntitlementForUser(supabaseAdmin, userId, environment);
  if (ent.bypass) return { ok: true };
  const metric: Metric = kind === "csv" ? "export_csv" : "export_pdf";
  return tryConsume(
    supabaseAdmin,
    userId,
    metric,
    ent.limits.exportsPerDay,
    ent.limits.exportsPerHour,
    ent.plan,
    `${kind.toUpperCase()} export`
  );
}

export async function consumeInsightReadQuota(
  supabaseAdmin: SupabaseClient,
  userId: string,
  environment: "sandbox" | "live" = "live"
): Promise<{ ok: true } | { ok: false; message: string; plan: PlanKey; reason: "daily" | "hourly" }> {
  const ent = await getEntitlementForUser(supabaseAdmin, userId, environment);
  if (ent.bypass) return { ok: true };
  return tryConsume(
    supabaseAdmin,
    userId,
    "insight_read",
    ent.limits.insightReadsPerDay,
    ent.limits.insightReadsPerHour,
    ent.plan,
    "full insight read"
  );
}

// ── Legacy non-atomic helpers (kept for backwards compatibility) ────────────
// Prefer the consume*Quota helpers above. These are still used by old code
// paths but should be migrated.

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
