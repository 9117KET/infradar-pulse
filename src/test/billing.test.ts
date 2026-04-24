import { describe, it, expect } from "vitest";
import { effectivePlan, PLAN_LIMITS, PLAN_RANK, planMeetsMinimum, PlanKey } from "@/lib/billing/limits";

// ── effectivePlan ────────────────────────────────────────────────────────────

describe("effectivePlan", () => {
  it("returns free when sub is null", () => {
    expect(effectivePlan(null)).toBe("free");
  });

  it("returns trialing for status=trialing", () => {
    expect(effectivePlan({ status: "trialing", plan_key: null, trial_end: null, current_period_end: null })).toBe("trialing");
  });

  it("returns pro for status=active + plan_key=pro", () => {
    expect(effectivePlan({ status: "active", plan_key: "pro", trial_end: null, current_period_end: null })).toBe("pro");
  });

  it("returns starter as fallback for active with unknown plan_key", () => {
    expect(effectivePlan({ status: "active", plan_key: "unknown_plan", trial_end: null, current_period_end: null })).toBe("starter");
  });

  it("returns starter for active with null plan_key", () => {
    expect(effectivePlan({ status: "active", plan_key: null, trial_end: null, current_period_end: null })).toBe("starter");
  });

  it("returns trialing when status=trialing even if plan_key=pro", () => {
    expect(effectivePlan({ status: "trialing", plan_key: "pro", trial_end: null, current_period_end: null })).toBe("trialing");
  });

  it("returns free for cancelled subscription with expired period", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(effectivePlan({ status: "canceled", plan_key: "pro", trial_end: null, current_period_end: past })).toBe("free");
  });

  it("returns plan for cancelled subscription still within period", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(effectivePlan({ status: "canceled", plan_key: "pro", trial_end: null, current_period_end: future })).toBe("pro");
  });

  it("returns trialing when trial_end is in the future and status inactive", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(effectivePlan({ status: "incomplete", plan_key: null, trial_end: future, current_period_end: null })).toBe("trialing");
  });
});

// ── PLAN_LIMITS ──────────────────────────────────────────────────────────────

describe("PLAN_LIMITS", () => {
  it("free tier has lower ai quota than starter", () => {
    expect(PLAN_LIMITS.free.aiPerDay).toBeLessThan(PLAN_LIMITS.starter.aiPerDay);
  });

  it("starter tier has lower ai quota than pro", () => {
    expect(PLAN_LIMITS.starter.aiPerDay).toBeLessThan(PLAN_LIMITS.pro.aiPerDay);
  });

  it("enterprise has effectively unlimited ai quota", () => {
    expect(PLAN_LIMITS.enterprise.aiPerDay).toBeGreaterThan(1000);
  });

  it("lifetime equals enterprise ai quota", () => {
    expect(PLAN_LIMITS.lifetime.aiPerDay).toBe(PLAN_LIMITS.enterprise.aiPerDay);
  });

  it("hourly cap is 0 (disabled) for enterprise and lifetime", () => {
    expect(PLAN_LIMITS.enterprise.aiPerHour).toBe(0);
    expect(PLAN_LIMITS.lifetime.aiPerHour).toBe(0);
  });

  it("free tier export quota is lower than starter", () => {
    expect(PLAN_LIMITS.free.exportsPerDay).toBeLessThan(PLAN_LIMITS.starter.exportsPerDay);
  });
});

// ── PLAN_RANK ────────────────────────────────────────────────────────────────

describe("PLAN_RANK", () => {
  it("free < trialing < starter < pro < enterprise", () => {
    const plans: PlanKey[] = ["free", "trialing", "starter", "pro", "enterprise"];
    for (let i = 0; i < plans.length - 1; i++) {
      expect(PLAN_RANK[plans[i]]).toBeLessThan(PLAN_RANK[plans[i + 1]]);
    }
  });

  it("lifetime rank equals enterprise rank", () => {
    expect(PLAN_RANK.lifetime).toBe(PLAN_RANK.enterprise);
  });
});

// ── planMeetsMinimum ─────────────────────────────────────────────────────────

describe("planMeetsMinimum", () => {
  it("free does not meet starter minimum", () => {
    expect(planMeetsMinimum("free", "starter")).toBe(false);
  });

  it("free does not meet pro minimum", () => {
    expect(planMeetsMinimum("free", "pro")).toBe(false);
  });

  it("starter meets starter minimum", () => {
    expect(planMeetsMinimum("starter", "starter")).toBe(true);
  });

  it("starter does not meet pro minimum", () => {
    expect(planMeetsMinimum("starter", "pro")).toBe(false);
  });

  it("pro meets starter minimum", () => {
    expect(planMeetsMinimum("pro", "starter")).toBe(true);
  });

  it("pro meets pro minimum", () => {
    expect(planMeetsMinimum("pro", "pro")).toBe(true);
  });

  it("enterprise meets pro minimum", () => {
    expect(planMeetsMinimum("enterprise", "pro")).toBe(true);
  });

  it("lifetime meets pro minimum", () => {
    expect(planMeetsMinimum("lifetime", "pro")).toBe(true);
  });

  it("trialing does not meet starter minimum", () => {
    expect(planMeetsMinimum("trialing", "starter")).toBe(false);
  });

  it("any plan meets free minimum", () => {
    const plans: PlanKey[] = ["free", "trialing", "starter", "pro", "enterprise", "lifetime"];
    for (const p of plans) {
      expect(planMeetsMinimum(p, "free")).toBe(true);
    }
  });
});
