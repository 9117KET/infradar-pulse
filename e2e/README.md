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
