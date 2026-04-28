# Strategic Roadmap — Top 5 Build-Ready Features

> Cross-references: high-level tracker lives in [`FEATURES.md`](../../FEATURES.md). Edge-function conventions, shared utilities, and entitlement patterns are documented in [`CLAUDE.md`](../../CLAUDE.md).
>
> **How to use this file:** When picking up a feature, jump to its section, follow the *Files to touch* list top-to-bottom, then update **Status** here AND in `FEATURES.md`.

---

## Status legend
| Symbol | Meaning |
|---|---|
| 🔲 Todo | Not started |
| 🔄 In Progress | Actively being built |
| ✅ Done | Shipped & verified |
| ⏸ Paused | Deprioritized |

## At-a-glance

| # | Feature | Status | Effort | Priority |
|---|---|---|---|---|
| 1 | Weekly Email Digest Delivery | 🔲 Todo | 2–3 days | ⭐⭐⭐ Quickest win |
| 2 | Natural Language Project Search | ✅ Done | 3–4 days | ⭐⭐⭐ |
| 3 | Win-Probability Score per Project | 🔲 Todo | 4–5 days | ⭐⭐ Biggest moat |
| 4 | AI Market Report Builder | ✅ Done | MVP shipped | ⭐⭐ |
| 5 | Public REST API + Webhooks | 🔲 Todo | 1–2 weeks | ⭐ Enterprise revenue |

---

## Feature 1 — Weekly Email Digest Delivery

**Status:** 🔲 Todo

### Why it matters
The `digest-agent` already generates weekly summaries but they only render in-app. Email delivery turns InfraRadar into a habit-forming channel that pulls users back every Monday → directly lifts retention and trial→paid conversion.

### User-facing surface
- **Settings → Notifications tab**: opt-in toggle "Weekly intelligence digest by email" + frequency selector (weekly / daily / off).
- **Email**: branded HTML digest, sent Mondays 07:00 user-local (UTC fallback).

### Data model (new migration)
```sql
create table public.digest_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  frequency text not null check (frequency in ('daily','weekly','off')) default 'weekly',
  channels text[] not null default '{email}',
  last_sent_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id)
);
alter table public.digest_subscriptions enable row level security;
create policy "users manage own digest subs" on public.digest_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Backend
- **Reuse:** existing `supabase/functions/digest-agent/index.ts` (generates content) + `supabase/functions/process-email-queue/` (delivery via Resend).
- **New edge function:** `supabase/functions/digest-dispatch/index.ts`
  - Cron-triggered (pg_cron, every hour, checks `frequency`+`last_sent_at`).
  - Calls `digest-agent` per subscriber → enqueues into `email_queue` via `enqueue_email` RPC.
  - Mark `last_sent_at = now()` on success.
- Use `transactional-email-templates/` pattern for the HTML template (`weekly-digest.tsx`).

### Frontend
- `src/pages/dashboard/Settings.tsx`: add a Notifications tab with the toggle (uses new `useDigestSubscription` hook).
- `src/hooks/use-digest-subscription.ts` (new): `select / upsert` against `digest_subscriptions`.
- `src/lib/api/agents.ts`: no change (cron-triggered).

### Entitlement gate
Free tier = monthly digest, Starter+ = weekly, Pro+ = daily option. Enforce in `digest-dispatch`.

### Acceptance criteria
- [ ] User can toggle digest in Settings; preference persists.
- [ ] Test cron run actually emails a sandbox account.
- [ ] Unsubscribe link works (uses existing `handle-email-unsubscribe`).
- [ ] `last_sent_at` prevents double-sending in the same window.

### Files to touch
| Action | Path |
|---|---|
| Create migration | `supabase/migrations/<ts>_digest_subscriptions.sql` |
| Create edge fn | `supabase/functions/digest-dispatch/index.ts` |
| Create template | `supabase/functions/_shared/transactional-email-templates/weekly-digest.tsx` |
| Register template | `supabase/functions/_shared/transactional-email-templates/registry.ts` |
| Edit settings | `src/pages/dashboard/Settings.tsx` |
| Create hook | `src/hooks/use-digest-subscription.ts` |

---

## Feature 2 — Natural Language Project Search ("Bloomberg moment")

**Status:** ✅ Done — shipped 2026-04-23. Live at `/dashboard/ask`.

### Why it matters
Replaces filter-driven search with `"Show me power projects in West Africa above $50M that moved to tender stage in the last 90 days"`. Headline differentiator vs. legacy intelligence publishers.

### User-facing surface
- New page **`/dashboard/ask`** (also surfaced as a global cmd+k search in `Navbar`).
- Input → loading skeleton → results grid (reuses `ProjectCard`) + "Why these results" explanation strip.

### Data model
No new tables. Optional: `nl_search_history` for personalization later.

### Backend — new edge function: `supabase/functions/nl-search/index.ts`
1. `assertAiAllowed` (counts toward `aiPerDay`).
2. Send the user prompt + a strict JSON schema describing allowed filters (country, sector, status, value_min, value_max, stage, date_range) to **Lovable AI** (`google/gemini-2.5-flash` — cheap + fast, structured output).
3. Validate the returned filter object (zod-style).
4. Translate to a Supabase query against `projects` (apply RLS automatically).
5. Return `{ projects, interpretation, confidence }`.
6. `incrementUsage('ai')`.

### Frontend
- `src/pages/dashboard/Research.tsx` already exists → mirror its structure but call `agentApi.runNlSearch(query)`.
- New page `src/pages/dashboard/Ask.tsx`.
- Add `runNlSearch` to `src/lib/api/agents.ts`.
- Register route in `src/App.tsx` and add to `NAV_GROUPS` in `src/layouts/DashboardLayout.tsx`.

### Entitlement gate
Free = 2 queries/day, Starter = 20, Pro = 100, Lifetime = unlimited (already covered by `aiPerDay`).

### Acceptance criteria
- [x] "power projects in Nigeria over 100M" returns relevant projects.
- [x] Vague prompts return interpretation + suggest filters.
- [x] Counts against AI quota (uses `requireAiEntitlementOrRespond`).
- [x] Works on mobile (responsive grid + stacked input).
- [x] Existing header `<ProjectSearch />` (instant fuzzy match) preserved alongside.

### Files to touch
| Action | Path |
|---|---|
| Create edge fn | `supabase/functions/nl-search/index.ts` |
| Create page | `src/pages/dashboard/Ask.tsx` |
| Edit registry | `src/lib/api/agents.ts` |
| Edit routes | `src/App.tsx` |
| Edit nav | `src/layouts/DashboardLayout.tsx` |

---

## Feature 3 — Win-Probability Score per Project

**Status:** 🔲 Todo

### Why it matters
Shifts InfraRadar from *descriptive* ("here's a project") to *predictive* ("this has a 72% chance of going to tender in 6 months"). Hardest feature for competitors to copy because it requires accumulated outcome data.

### User-facing surface
- **ProjectDetail header**: badge `Win probability: 72%` with hover tooltip showing top 3 contributing factors.
- **Projects list**: sortable column.
- **Portfolio**: weighted-pipeline-value summary card (`Σ project_value × probability`).

### Data model
```sql
create table public.project_scores (
  project_id uuid primary key references public.projects(id) on delete cascade,
  win_probability numeric(5,2) not null check (win_probability between 0 and 100),
  factors jsonb not null default '[]'::jsonb, -- [{factor, weight, direction}]
  model_version text not null,
  scored_at timestamptz not null default now()
);
alter table public.project_scores enable row level security;
create policy "read scores follows project visibility" on public.project_scores
  for select using (
    exists (select 1 from public.projects p where p.id = project_id)
  );
```

### Backend — new edge function: `supabase/functions/win-probability-agent/index.ts`
- Cron: nightly (pg_cron) + on-demand from agents dashboard.
- For each project, compute features: funding_secured, contract_awarded_count, recent_alert_velocity, stakeholder_signals, country_risk, sector_baseline, days_since_last_update.
- v1 = transparent rule-based scoring (sum of weighted features, normalized 0–100). v2 (later) = ML model trained on historical outcomes.
- Always emit `factors[]` so the UI can explain the score.

### Frontend
- `src/pages/dashboard/ProjectDetail.tsx`: render `<WinProbabilityBadge />`.
- New `src/components/projects/WinProbabilityBadge.tsx`.
- `src/hooks/use-project-score.ts`: fetches `project_scores` row.
- Pricing gate: Starter+ only. Free tier sees blurred badge with upgrade CTA.

### Entitlement gate
Add capability `canSeeWinProbability` to `useEntitlements` (Starter, Pro, Enterprise, Lifetime).

### Acceptance criteria
- [ ] Score appears on every project after agent runs.
- [ ] Factors tooltip lists top 3 with directions.
- [ ] Free tier shows upgrade CTA, not the number.
- [ ] Score updates after new alerts arrive (re-runs nightly).

### Files to touch
| Action | Path |
|---|---|
| Create migration | `supabase/migrations/<ts>_project_scores.sql` |
| Create edge fn | `supabase/functions/win-probability-agent/index.ts` |
| Add to registry | `src/lib/api/agents.ts` (`runWinProbabilityAgent`) |
| Create component | `src/components/projects/WinProbabilityBadge.tsx` |
| Create hook | `src/hooks/use-project-score.ts` |
| Edit detail | `src/pages/dashboard/ProjectDetail.tsx` |
| Edit list | `src/pages/dashboard/Projects.tsx` |
| Edit entitlements | `src/hooks/useEntitlements.ts` |
| Register agent | `supabase/migrations/<ts>_agent_config_win_prob.sql` |

---

## Feature 4 — AI Market Report Builder

**Status:** ✅ Done — MVP shipped 2026-04-28. Live under `/dashboard/intelligence-summaries` for staff/researchers.

### Why it matters
Legacy vendors sell expensive static market PDFs. InfraRadar turns that job into a live workflow: scope the market, generate a report from current projects/alerts/updates/citations, then ask follow-up questions in the platform.

### User-facing surface
- **Intelligence Summaries**: report builder for Country Projects Market, Sector Pipeline, Tender & Awards Outlook, Portfolio Risk Brief and Market Snapshot.
- Report cards show scope, project count, pipeline value, risk metrics, source count, markdown report body and citations.
- PDF export produces a branded report with KPI summary, sectioned content, citations appendix and watermarking.

### Data model
No new tables. Reuses `report_runs.parameters`, `markdown`, and `citations`.

### Future upgrades
- Scheduled monthly/country reports.
- User-facing report builder behind paid entitlements.
- White-label enterprise report exports.
- Public/private report sharing links.
- Chart-heavy PDF generation with richer layouts.
- Analyst review/approval workflow before public publication.
- Return signed URL (upload to a new `exports` storage bucket) or stream as `application/pdf`.

### Frontend
- `src/pages/dashboard/ProjectDetail.tsx`: add `<ExportOnePagerButton />`.
- `src/components/projects/ExportOnePagerButton.tsx` (new).
- `src/lib/api/agents.ts`: `runProjectOnepager(projectId)`.

### Entitlement gate
Starter = 5/month, Pro = unlimited (use `exportsPerDay`). Free tier = upgrade CTA.

### Acceptance criteria
- [ ] PDF renders without overflow on any project.
- [ ] All InfraRadar branding (colors, logo, footer).
- [ ] Decrements export quota.
- [ ] Works for projects with sparse data (graceful empty states).

### Files to touch
| Action | Path |
|---|---|
| Create edge fn | `supabase/functions/project-onepager/index.ts` |
| Create storage bucket | migration: `exports` bucket, signed URL only |
| Add to registry | `src/lib/api/agents.ts` |
| Create button | `src/components/projects/ExportOnePagerButton.tsx` |
| Edit detail | `src/pages/dashboard/ProjectDetail.tsx` |

---

## Feature 5 — Public REST API + Webhooks

**Status:** 🔲 Todo

### Why it matters
Enterprise buyers (banks, EPCs) want to pipe InfraRadar data into their CRM/Power BI. Without an API, deals stall. Also enables a "$2k/mo Enterprise" tier on the pricing page.

### User-facing surface
- New page **`/dashboard/api-access`** (Pro+ only, Enterprise primarily).
- Generate / revoke API keys; subscribe webhook URLs to event types (`project.created`, `alert.fired`, `tender.awarded`).
- Public docs page **`/api`** (marketing route) with curl examples.

### Data model
```sql
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique,           -- store sha256(key), never plaintext
  key_prefix text not null,                -- first 8 chars for UI display
  name text,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  revoked_at timestamptz
);
create table public.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  events text[] not null,
  secret text not null,                    -- HMAC signing secret
  active boolean default true,
  created_at timestamptz default now()
);
create table public.api_request_log (
  id bigserial primary key,
  api_key_id uuid references public.api_keys(id) on delete set null,
  endpoint text not null,
  status int not null,
  created_at timestamptz default now()
);
-- RLS: users see only their own keys / subs / logs
```

### Backend
- **New edge functions** under `supabase/functions/api-v1-*/`:
  - `api-v1-projects` (GET list, GET by id)
  - `api-v1-alerts`
  - `api-v1-tenders`
- Each: validate `Authorization: Bearer <api_key>` → look up `key_hash` → enforce per-key rate limit via `consume_quota` RPC → log to `api_request_log`.
- **New edge function:** `webhook-dispatcher` — listens to `pg_notify` channels (or polled queue), POSTs payload with `X-InfraRadar-Signature: sha256=<hmac>` header, retries with exponential backoff.

### Frontend
- New page `src/pages/dashboard/ApiAccess.tsx` (key generator + webhook manager).
- New marketing page `src/pages/Api.tsx` with curl/JS examples.
- Register routes in `src/App.tsx` + nav in `DashboardLayout.tsx` (Pro+ via `RoleGuard`-style entitlement check).

### Entitlement gate
Add `canAccessApi` capability — Pro tier and above (Enterprise primarily). Free/Starter = upgrade CTA on the page.

### Acceptance criteria
- [ ] User can mint an API key once (only shown at creation), revoke any time.
- [ ] `curl -H "Authorization: Bearer <key>" /api/v1/projects` returns JSON.
- [ ] Per-key rate limit (e.g. 1000 req/day Pro, 10k Enterprise).
- [ ] Webhook delivery includes valid HMAC signature.
- [ ] Failed webhooks retry 3× then mark `active=false`.

### Files to touch
| Action | Path |
|---|---|
| Create migration | `supabase/migrations/<ts>_public_api.sql` |
| Create edge fns | `supabase/functions/api-v1-projects/index.ts`, `api-v1-alerts/`, `api-v1-tenders/`, `webhook-dispatcher/` |
| Create dashboard page | `src/pages/dashboard/ApiAccess.tsx` |
| Create docs page | `src/pages/Api.tsx` |
| Edit routes | `src/App.tsx` |
| Edit nav | `src/layouts/DashboardLayout.tsx` |
| Edit entitlements | `src/hooks/useEntitlements.ts` + `src/lib/billing/limits.ts` + mirror in `supabase/functions/_shared/billing.ts` |
| Edit pricing | `src/pages/Pricing.tsx` (add API access to Pro/Enterprise rows) |

---

## Conventions reminder (read before coding any of the above)

1. **Edge function template**: import from `_shared/` (`agentGate`, `auth`, `entitlementCheck`, `llm`). See `supabase/functions/report-agent/index.ts` for the canonical pattern.
2. **Client invocation**: only `src/lib/api/agents.ts` calls `supabase.functions.invoke`.
3. **Plan limits**: any new metric MUST be added to BOTH `src/lib/billing/limits.ts` and `supabase/functions/_shared/billing.ts` (no shared source — manual sync).
4. **AI calls**: prefer Lovable AI Gateway models (`google/gemini-2.5-flash` for cheap, `openai/gpt-5` for accuracy). No user API keys required.
5. **RLS**: every new table MUST have RLS enabled before merge. Use `has_role()` security-definer for staff bypass.
6. **Pauseable agents**: register in `agent_config` migration so they appear in `/dashboard/agents`.

---

## Update protocol

When you start a feature:
1. Flip its **Status** here to 🔄 In Progress.
2. Mirror in `FEATURES.md`.
3. On ship, flip both to ✅ Done and check the acceptance-criteria boxes inline.
