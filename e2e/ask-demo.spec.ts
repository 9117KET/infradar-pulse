import { test, expect } from "@playwright/test";

/**
 * Frontend behaviour test for the public Ask AI demo (/ask-demo).
 *
 * The Edge Function call is intercepted so this passes WITHOUT a live backend
 * deploy. It locks in the request/response contract between AskDemo.tsx and
 * nl-search-public:
 *  - { mode: "examples" } returns chips + the caller's current usage (no query)
 *  - a chip click sends { filters } and renders results
 *  - the free-query counter counts down 3 -> 2 -> 1 -> signup wall
 *  - the "closest matches" note appears when a result is relaxed
 *  - the counter reflects server state on load, so a refresh can't reset it
 */

const FN = "**/functions/v1/nl-search-public";

type Body = { mode?: string; filters?: unknown; query?: string };

function examplesPayload(queriesUsed = 0) {
  return {
    examples: [
      { prompt: "Energy projects in MENA", filters: { sectors: ["Energy"], regions: ["MENA"] } },
      { prompt: "Transport projects in East Africa", filters: { sectors: ["Transport"], regions: ["East Africa"] } },
    ],
    queries_used: queriesUsed,
    queries_limit: 3,
    queries_remaining: Math.max(0, 3 - queriesUsed),
  };
}

function projectPayload(n: number, queriesRemaining: number, relaxed = false) {
  return {
    projects: [
      {
        id: `p${n}`,
        slug: `demo-project-${n}`,
        name: `Demo Project ${n}`,
        country: "Egypt",
        region: "MENA",
        sector: "Energy",
        stage: "Tender",
        status: "Verified",
        value_usd: 200_000_000,
        value_label: "$200M",
        confidence: 88,
        risk_score: 30,
        description: "A verified demo project used in the e2e test.",
      },
    ],
    filters: {
      regions: ["MENA"], sectors: ["Energy"], stages: [], statuses: [],
      countries: [], value_min_usd: null, value_max_usd: null, keyword: null, order_by: "value",
    },
    interpretation: "Showing Energy projects in MENA.",
    relaxed,
    queries_used: 3 - queriesRemaining,
    queries_limit: 3,
    queries_remaining: queriesRemaining,
  };
}

test("suggested chips return results and the counter counts down to the signup wall", async ({ page }) => {
  let searches = 0;

  await page.route(FN, async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as Body;

    if (body.mode === "examples") {
      await route.fulfill({ json: examplesPayload(0) });
      return;
    }

    searches += 1;
    await route.fulfill({ json: projectPayload(searches, 3 - searches) });
  });

  await page.goto("/ask-demo");

  // Starts at 3 remaining.
  await expect(page.getByText("3 free queries remaining today")).toBeVisible();

  // Chips are data-driven from the examples response.
  const chip = page.getByRole("button", { name: "Energy projects in MENA" });
  await expect(chip).toBeVisible();

  // 1st query (chip click) -> results render, counter -> 2.
  await chip.click();
  await expect(page.getByText("Demo Project 1")).toBeVisible();
  await expect(page.getByText("2 free queries remaining today")).toBeVisible();

  // 2nd query (typed) -> counter -> 1 (singular).
  await page.getByRole("textbox").fill("Power projects in MENA");
  await page.getByRole("button", { name: /Ask/ }).click();
  await expect(page.getByText("Demo Project 2")).toBeVisible();
  await expect(page.getByText("1 free query remaining today")).toBeVisible();

  // 3rd query -> queries_remaining 0 -> signup wall.
  await page.getByRole("textbox").fill("Water projects in MENA");
  await page.getByRole("button", { name: /Ask/ }).click();
  await expect(page.getByText(/You've used all 3 free demo queries/)).toBeVisible();
});

test("examples fetch costs no query and the relaxed note shows on a fallback match", async ({ page }) => {
  let exampleCalls = 0;
  let searches = 0;

  await page.route(FN, async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as Body;
    if (body.mode === "examples") {
      exampleCalls += 1;
      await route.fulfill({ json: examplesPayload(0) });
      return;
    }
    searches += 1;
    await route.fulfill({ json: projectPayload(searches, 3 - searches, true) });
  });

  await page.goto("/ask-demo");
  await expect(page.getByText("3 free queries remaining today")).toBeVisible();

  // The examples fetch happened but did NOT consume a query.
  expect(exampleCalls).toBeGreaterThan(0);
  await expect(page.getByText("3 free queries remaining today")).toBeVisible();

  await page.getByRole("button", { name: "Energy projects in MENA" }).click();
  await expect(page.getByText("No exact match — showing the closest projects we found.")).toBeVisible();
  await expect(page.getByText("2 free queries remaining today")).toBeVisible();
});

test("counter reflects server-side usage on load — a refresh cannot reset it", async ({ page }) => {
  // The server reports 2 already used today for this IP. On a fresh page load
  // the counter must show 1 remaining (not the optimistic 3), so a refresh is
  // not a way to get more queries.
  await page.route(FN, async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as Body;
    if (body.mode === "examples") {
      await route.fulfill({ json: examplesPayload(2) });
      return;
    }
    await route.fulfill({ json: projectPayload(3, 0) });
  });

  await page.goto("/ask-demo");
  await expect(page.getByText("1 free query remaining today")).toBeVisible();
  // The optimistic default must NOT win.
  await expect(page.getByText("3 free queries remaining today")).toHaveCount(0);
});

test("an already-exhausted visitor sees the signup wall immediately on load", async ({ page }) => {
  await page.route(FN, async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as Body;
    if (body.mode === "examples") {
      await route.fulfill({ json: examplesPayload(3) });
      return;
    }
    await route.fulfill({ json: { error: "rate_limited", queries_used: 3, queries_limit: 3, queries_remaining: 0 } });
  });

  await page.goto("/ask-demo");
  await expect(page.getByText(/You've used all 3 free demo queries/)).toBeVisible();
});

test("persists the signed visitor token and resends it on the next request", async ({ page }) => {
  const TOKEN = "v1.11111111-1111-1111-1111-111111111111.9999999999.deadbeef";
  let searchSawToken = false;

  await page.route(FN, async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as Body & { visitor_token?: string };
    if (body.mode === "examples") {
      await route.fulfill({ json: { ...examplesPayload(0), visitor_token: TOKEN } });
      return;
    }
    if (body.visitor_token === TOKEN) searchSawToken = true;
    await route.fulfill({ json: { ...projectPayload(1, 2), visitor_token: TOKEN } });
  });

  await page.goto("/ask-demo");
  await page.getByRole("button", { name: "Energy projects in MENA" }).click();
  await expect(page.getByText("Demo Project 1")).toBeVisible();
  expect(searchSawToken).toBe(true);
});
