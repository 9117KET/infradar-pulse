import { test, expect, APIRequestContext } from "@playwright/test";

/**
 * Agent reliability fixes — run against the LOCAL Supabase stack.
 *
 * Verifies:
 *  1. Pause gates: the 10 previously-unguarded agents now honor agent_config.enabled.
 *  2. Resume: re-enabled agents run again (no stale paused response).
 *  3. AI-unavailable runs are recorded as FAILED (not silent success) and the
 *     begin_agent_task lock is released.
 *  4. Crash paths call failAgentTask: the run lock is released and the task marked failed.
 *  5. alerts.origin provenance column: default 'system', accepts 'ai_agent', rejects junk.
 *
 * Prereqs: `supabase start` + migrations applied + seeded test users
 * (npm run sb:seed-security-test-users). LOVABLE_API_KEY must NOT be set in the
 * local functions runtime — these tests rely on the AI gateway being unavailable.
 */

const SUPA = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON =
  process.env.LOCAL_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SVC =
  process.env.LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const STAFF_EMAIL = process.env.SECURITY_TEST_STAFF_EMAIL ?? "security-test-staff@infradar.local";
const STAFF_PASSWORD = process.env.SECURITY_TEST_STAFF_PASSWORD ?? "SecurityTest_Staff_01!";

const svcHeaders = {
  Authorization: `Bearer ${SVC}`,
  apikey: SVC,
  "Content-Type": "application/json",
};

async function setAgentEnabled(request: APIRequestContext, agentType: string, enabled: boolean) {
  const res = await request.patch(
    `${SUPA}/rest/v1/agent_config?agent_type=eq.${agentType}`,
    {
      headers: { ...svcHeaders, Prefer: "return=representation" },
      data: { enabled },
    },
  );
  expect(res.ok(), `agent_config PATCH for ${agentType}: ${res.status()}`).toBeTruthy();
  const rows = await res.json();
  expect(rows.length, `agent_config row missing for ${agentType}`).toBeGreaterThan(0);
}

async function invokeFn(
  request: APIRequestContext,
  fnName: string,
  bearer: string,
  body: Record<string, unknown> = {},
) {
  return request.post(`${SUPA}/functions/v1/${fnName}`, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      apikey: ANON,
      "Content-Type": "application/json",
    },
    data: body,
    timeout: 120_000,
  });
}

async function staffJwt(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON, "Content-Type": "application/json" },
    data: { email: STAFF_EMAIL, password: STAFF_PASSWORD },
  });
  expect(res.ok(), `staff sign-in failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const json = await res.json();
  return json.access_token as string;
}

async function latestTask(request: APIRequestContext, taskType: string) {
  const res = await request.get(
    `${SUPA}/rest/v1/research_tasks?task_type=eq.${taskType}&order=created_at.desc&limit=1&select=status,error`,
    { headers: svcHeaders },
  );
  expect(res.ok()).toBeTruthy();
  const rows = await res.json();
  return rows[0] ?? null;
}

async function runningCount(request: APIRequestContext, taskType: string): Promise<number> {
  const res = await request.get(
    `${SUPA}/rest/v1/research_tasks?task_type=eq.${taskType}&status=eq.running&select=id`,
    { headers: svcHeaders },
  );
  expect(res.ok()).toBeTruthy();
  return (await res.json()).length;
}

// agent_config agent_type → Edge Function name (staff-invocable with service-role bearer)
const STAFF_AGENTS: Array<[string, string]> = [
  ["market-intel", "market-intel"],
  ["funding-tracker", "funding-tracker"],
  ["executive-briefing", "executive-briefing"],
  ["alert-intelligence", "alert-intelligence"],
  ["report-agent", "report-agent"],
  ["dataset-refresh", "dataset-refresh-agent"],
  ["source-ingest", "source-ingest-agent"],
  ["contact-finder", "contact-finder"],
];

// These two sit behind requireAiEntitlementOrRespond — need a real user JWT.
const USER_AGENTS: Array<[string, string]> = [
  ["digest-agent", "digest-agent"],
  ["user-research", "user-research"],
];

test.describe("Fix 1: pause gates", () => {
  for (const [agentType, fnName] of STAFF_AGENTS) {
    test(`${fnName} honors pause toggle`, async ({ request }) => {
      await setAgentEnabled(request, agentType, false);
      try {
        const res = await invokeFn(request, fnName, SVC);
        expect(res.status(), await res.text()).toBe(200);
        const body = await res.json();
        expect(body.paused, `${fnName} ignored the pause switch: ${JSON.stringify(body)}`).toBe(true);
      } finally {
        await setAgentEnabled(request, agentType, true);
      }
    });
  }

  for (const [agentType, fnName] of USER_AGENTS) {
    test(`${fnName} honors pause toggle (user-facing)`, async ({ request }) => {
      const jwt = await staffJwt(request);
      await setAgentEnabled(request, agentType, false);
      try {
        const res = await invokeFn(request, fnName, jwt, { query: "test pause gate" });
        expect(res.status(), await res.text()).toBe(200);
        const body = await res.json();
        expect(body.paused, `${fnName} ignored the pause switch: ${JSON.stringify(body)}`).toBe(true);
      } finally {
        await setAgentEnabled(request, agentType, true);
      }
    });
  }

  test("re-enabled agent resumes (no stale paused response)", async ({ request }) => {
    await setAgentEnabled(request, "market-intel", true);
    const res = await invokeFn(request, "market-intel", SVC);
    const body = await res.json().catch(() => ({}));
    expect(body.paused).not.toBe(true);
  });
});

test.describe("Fix 2+3: failed runs are recorded as failed and release the lock", () => {
  test("market-intel without AI gateway → task failed, lock released", async ({ request }) => {
    await setAgentEnabled(request, "market-intel", true);
    const res = await invokeFn(request, "market-intel", SVC);
    // No LOVABLE_API_KEY locally: research returns nothing → run must FAIL, not
    // complete with 0 insights.
    const body = await res.json().catch(() => ({}));
    expect(body.success).not.toBe(true);

    const task = await latestTask(request, "market-intel");
    expect(task, "no research_tasks row written").not.toBeNull();
    expect(task.status).toBe("failed");
    expect(await runningCount(request, "market-intel")).toBe(0);
  });

  test("alert-intelligence crash path → failAgentTask releases lock, task failed", async ({ request }) => {
    // Seed one alert so the agent gets past the "no alerts" early return and
    // reaches chatCompletions, which throws without LOVABLE_API_KEY.
    const ins = await request.post(`${SUPA}/rest/v1/alerts`, {
      headers: { ...svcHeaders, Prefer: "return=representation" },
      data: {
        project_name: "E2E Crash Path Seed",
        severity: "low",
        message: "seed alert for alert-intelligence crash-path test",
        category: "market",
      },
    });
    expect(ins.ok(), await ins.text()).toBeTruthy();

    await setAgentEnabled(request, "alert-intelligence", true);
    const res = await invokeFn(request, "alert-intelligence", SVC);
    expect(res.status()).toBe(500);

    const task = await latestTask(request, "alert-intelligence");
    expect(task).not.toBeNull();
    expect(task.status).toBe("failed");
    expect(await runningCount(request, "alert-intelligence")).toBe(0);
  });

  test("regulatory-monitor (template agent) → no stuck running lock after failed run", async ({ request }) => {
    await setAgentEnabled(request, "regulatory-monitor", true);
    const res = await invokeFn(request, "regulatory-monitor", SVC);
    expect([200, 500]).toContain(res.status());
    expect(await runningCount(request, "regulatory-monitor")).toBe(0);
    const task = await latestTask(request, "regulatory-monitor");
    expect(task).not.toBeNull();
    expect(task.status).not.toBe("completed"); // AI unavailable must never look like success
  });
});

test.describe("Fix 4: alerts.origin provenance", () => {
  test("AI-agent alerts carry origin=ai_agent; default stays system; junk rejected", async ({ request }) => {
    // 1. ai_agent origin accepted
    const aiRes = await request.post(`${SUPA}/rest/v1/alerts`, {
      headers: { ...svcHeaders, Prefer: "return=representation" },
      data: {
        project_name: "E2E Origin Test (AI)",
        severity: "low",
        message: "AI-generated alert with provenance",
        category: "market",
        origin: "ai_agent",
      },
    });
    expect(aiRes.ok(), await aiRes.text()).toBeTruthy();
    expect((await aiRes.json())[0].origin).toBe("ai_agent");

    // 2. omitted origin defaults to system
    const sysRes = await request.post(`${SUPA}/rest/v1/alerts`, {
      headers: { ...svcHeaders, Prefer: "return=representation" },
      data: {
        project_name: "E2E Origin Test (default)",
        severity: "low",
        message: "alert without explicit origin",
        category: "market",
      },
    });
    expect(sysRes.ok()).toBeTruthy();
    expect((await sysRes.json())[0].origin).toBe("system");

    // 3. check constraint rejects junk values
    const junkRes = await request.post(`${SUPA}/rest/v1/alerts`, {
      headers: { ...svcHeaders, Prefer: "return=representation" },
      data: {
        project_name: "E2E Origin Test (junk)",
        severity: "low",
        message: "alert with invalid origin",
        category: "market",
        origin: "totally-bogus",
      },
    });
    expect(junkRes.ok()).toBeFalsy();
  });
});

// Browser (Chromium) test: the AI-provenance badge is visible in the dashboard.
// Requires the Vite dev server pointed at the local stack:
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=<anon> npm run dev
test.describe("Fix 4 (UI): unverified-AI badge in alerts dashboard", () => {
  test("AI · unverified badge renders for ai_agent alerts", async ({ page, request }) => {
    // Ensure at least one ai_agent alert exists
    await request.post(`${SUPA}/rest/v1/alerts`, {
      headers: svcHeaders,
      data: {
        project_name: "E2E Badge Test",
        severity: "high",
        message: "E2E badge visibility check — AI generated",
        category: "market",
        origin: "ai_agent",
      },
    });

    await page.goto("/login");
    await page.locator('input[type="email"]').fill(STAFF_EMAIL);
    await page.locator('input[type="password"]').fill(STAFF_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/dashboard/, { timeout: 30_000 });

    await page.goto("/dashboard/alerts");
    await expect(page.getByText("AI · unverified").first()).toBeVisible({ timeout: 30_000 });
  });
});
