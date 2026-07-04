# E2E & Scenario Testing

Two complementary layers for catching "unexpected behaviour" before go-live.

| Layer | What it is | Deterministic? | Cost | When to run |
|---|---|---|---|---|
| **A — Route crawler** | Playwright walks every route as each role and flags broken pages | Yes | Free | Every PR / pre-deploy (CI) |
| **B — Agentic exploration** | Claude drives a real browser (Playwright MCP) through scenarios you describe in English | No | AI credits | Exploratory, before big releases |

The existing focused specs (`auth-flow`, `rbac-enforcement`, `feature-*`, `live-smoke`)
remain the hand-written scenario tests. The crawler is the broad safety net.

---

## Prerequisites (local run with a real backend)

The app talks to whatever `VITE_SUPABASE_URL` resolves to. In dev that's the
**local stack** (`.env.development.local` → `http://127.0.0.1:54321`), so bring it up:

```bash
npm run sb:start                       # Docker + local Supabase (first run pulls images)
npm run sb:seed-security-test-users    # creates user / staff / pro / free, all onboarded
npm run dev                            # app on http://localhost:8080
```

> Windows note: if `sb:seed-security-test-users` fails with `spawnSync … EINVAL`,
> export the local keys first (the script has an env fast-path):
> ```pwsh
> $s = npx supabase status -o json | ConvertFrom-Json
> $env:LOCAL_SUPABASE_URL=$s.API_URL
> $env:LOCAL_SUPABASE_ANON_KEY=$s.ANON_KEY
> $env:LOCAL_SUPABASE_SERVICE_ROLE_KEY=$s.SERVICE_ROLE_KEY
> node scripts/seed-security-test-users.mjs
> ```

Local edge functions are **not** served by `supabase start`, so `track-event`,
`public-stats`, AI functions etc. return 503/404. That's why backend HTTP faults
are warnings, not failures (see below). Their real health is checked by
`e2e/live-smoke.spec.ts` against production.

---

## Layer A — Route crawler

Walks `PUBLIC_ROUTES`, `USER_ROUTES`, `STAFF_ROUTES` (see `e2e/utils/routes.ts`)
in a single browser window per role, and on each page collects:

- **uncaught exceptions** (page crashes)            → **SEVERE** (fails the gate)
- **console errors** (incl. CORS misconfig)         → **SEVERE**
- **HTTP 4xx/5xx** + failed requests                → warning (env-dependent)
- **serious/critical a11y violations** (axe-core)   → warning

```bash
npm run test:crawl          # headless gate (severe-only)
npm run test:crawl:watch    # ONE visible window, slowed down — watch it tour the app
npm run test:crawl:ui       # Playwright UI mode (time-travel, pick & re-run)
```

Enforce the warnings too (run against a fully-provisioned backend, e.g. a staging
deploy via `PLAYWRIGHT_BASE_URL`):

```bash
CRAWL_STRICT=1 npm run test:crawl
```

Tuning lives in `e2e/utils/page-health.ts` (`IGNORED_CONSOLE`,
`IGNORED_RESPONSE_HOSTS`, `NON_BLOCKING_PATHS`). Add routes in `e2e/utils/routes.ts`.

### Reading results
Each route prints `✓ clean` or a `[SEVERE]/[warn]` list. Full per-route reports
are attached to the HTML report: `npx playwright show-report`.

---

## Layer C — Entitlement & Usage Limits spec (`entitlement-limits.spec.ts`)

Verifies the advertised billing limits actually enforce as intended, both
client-side (UpgradeDialog gates) and server-side (402 responses from the
Edge Function runtime). Split into two tiers:

**Tier 1 — Public (no auth, always runnable):**
- Pricing page text matches `PLAN_LIMITS` constants in `src/lib/billing/limits.ts`
- JSON-LD structured data prices are correct (regression: Pro was `$99`, fixed to `$199`)
- Pilot auto-grant banner is present and discloses seat count

**Tier 2 — Dashboard (requires auth):**
These tests use `page.route()` interception to inject 402 responses **without
needing a live edge-function runtime**, so they pass even with local Supabase
stopped. They log in via `fixtures/auth.ts` as `security-test-user@infradar.local`.

- `UpgradeDialog` opens on server-returned 402 ENTITLEMENT (fixed regression in Ask.tsx)
- `UpgradeDialog` opens on server-returned 402 PLAN_REQUIRED (nl-search starter minimum)
- Successful 200 response renders project results without opening UpgradeDialog
- Dialog can be dismissed cleanly (no crash, page remains functional)
- Usage counter shown for non-staff users (smoke check, no crash)
- Client-side pre-block opens UpgradeDialog without calling nl-search when cap hit

```bash
npm run test:limits          # headless, entitlement spec only (fastest single focus)
npm run test:limits:watch    # headed/slow-mo for visual debugging
npm run test:crawl           # full CI gate including this spec + crawl specs
```

### GuidedTour interaction note

The `GuidedTour` overlay (`z-[9999]` fixed div) blocks all pointer events on
first login. It fires via a `setTimeout(800ms)` after the auth profile loads
asynchronously — total latency from `page.goto()` to overlay appearance can
exceed 3 seconds. Each test:

1. Navigates with `{ waitUntil: "networkidle" }` so auth finishes loading first.
2. Calls `dismissTourIfVisible()` which waits up to 6 seconds for the overlay,
   then clicks the "Skip tour" button. Safe to call if no tour appears.

### Auth constraint

`security-test-user@infradar.local` must exist in whatever Supabase backend
`VITE_SUPABASE_URL` points to:

- **Hosted Supabase** (default `.env`): run `npm run sb:seed-security-test-users`
  targeting the hosted instance (update env vars or seed manually via Supabase dashboard).
- **Local Supabase**: `npm run sb:start && npm run sb:seed-security-test-users`.

If the user is missing, all Tier-2 tests auto-skip gracefully (no failure noise).

### Pilot auto-grant note

Any user who logs in via the browser UI has `claim_own_pilot_access()` called in
`AuthContext`, granting 30 days of Enterprise access. This means the Tier-2 tests
cannot trigger real free-tier caps through the live edge runtime — they use
`page.route()` interception instead. For true end-to-end cap testing against the
local stack, use `npm run test:edge-security` (logs in via API to skip the pilot
claim).

---

## Layer B — Agentic exploration (Playwright MCP)

`.mcp.json` registers the [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp)
server, which gives Claude Code browser tools (navigate, click, type, snapshot).

**Enable it:** restart Claude Code in this repo and approve the `playwright`
MCP server when prompted (`/mcp` lists its status).

**Use it:** with the dev server running, ask in plain English, e.g.

> Open http://localhost:8080, log in as `security-test-user@infradar.local` /
> `SecurityTest_User_01!`, go to the Ask page, send a query, and tell me anything
> that looks broken or confusing. Then try to reach `/dashboard/users` and report
> what happens.

Claude reasons about each screen, reports unexpected behaviour, and — unlike the
deterministic crawler — can improvise scenarios. It is non-deterministic and uses
AI credits, so treat it as exploratory QA, not a CI gate. Promote anything it
finds into a deterministic Layer-A route or a focused spec.
