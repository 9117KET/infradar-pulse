# InfraRadar Pulse — Feature Tracker

Live document tracking all planned, in-progress, and completed features. Update this file as features are implemented, refined, or deprioritized.

---

## Navigation Consolidation

Reducing cognitive load by grouping features around user workflows instead of internal feature names.

| Task | Status | Notes |
|---|---|---|
| Reclassify sidebar groups by workflow | ✅ Done | Command Center, Projects & Portfolio, Market Intelligence, Reports & Insights, Research Operations, Admin |
| Keep operational tools researcher/admin-only | ✅ Done | Research, Evidence, Review Queue, Agents hidden from regular users |
| Move user-facing reports into Reports & Insights | ✅ Done | Intelligence Summaries visible as the main AI report hub |
| Merge Risk Signals → "Risk" tab in Projects | ✅ Done | URL redirect: `/dashboard/risk` → `/dashboard/projects?tab=risk` |
| Merge Real-Time Monitoring → "System Health" tab in Agents | ✅ Done | URL redirect: `/dashboard/monitoring` → `/dashboard/agents` |
| Make Evidence & Verification researcher-only | ✅ Done | Changed `minRole` in DashboardLayout |
| Merge Analytics & Reports → "Analytics" tab in Projects | ✅ Done | URL redirect: `/dashboard/analytics-reports` → `/dashboard/projects?tab=analytics` |
| Merge Digests + Reports → Intelligence Summaries page | ✅ Done | URL redirects for both old URLs |
| Update DashboardLayout NAV_GROUPS | ✅ Done | |
| Update App.tsx routes + redirects | ✅ Done | |

---

## Strategic Roadmap

Top-5 high-leverage features identified in product review. **Full build specs (data model, edge functions, files to touch, acceptance criteria) live in [`docs/roadmap/STRATEGIC_FEATURES.md`](docs/roadmap/STRATEGIC_FEATURES.md).** Update both this checklist AND that doc when status changes.

| # | Feature | Status | Effort | Notes |
|---|---|---|---|---|
| 1 | Weekly Email Digest Delivery | 🔲 Todo | 2–3 days | Reuses `digest-agent` + `process-email-queue` |
| 2 | Natural Language Project Search | ✅ Done | 3–4 days | `/dashboard/ask` + `nl-search` edge fn (Lovable AI) |
| 3 | Win-Probability Score per Project | 🔲 Todo | 4–5 days | New `project_scores` table + nightly agent |
| 4 | AI Market Report Builder | ✅ Done | MVP shipped | Scoped country/sector/tender/portfolio reports from live projects, alerts and citations |
| 5 | Public REST API + Webhooks | 🔲 Todo | 1–2 weeks | Enterprise revenue unlock |

---

## Phase 1 — Backend-Ready Features (ship first)

Backend infrastructure is complete; these are purely UI additions.

| Feature | Status | File(s) | Notes |
|---|---|---|---|
| **My Portfolio** — tracked project watchlist page | ✅ Done | `src/pages/dashboard/Portfolio.tsx` | Uses existing `tracked_projects` table + `use-tracked-projects` hook |
| `updateNotes` mutation in useTrackedProjects | ✅ Done | `src/hooks/use-tracked-projects.ts` | Adds inline note editing to Portfolio |
| **Alert Rules** — CRUD UI for notification rules | ✅ Done | `src/components/alerts/AlertRulesTab.tsx`, `src/hooks/use-alert-rules.ts` | Tab added inside Alerts page; uses existing `alert_rules` table |
| **Project Changelog** — update history tab in ProjectDetail | ✅ Done | `src/pages/dashboard/ProjectDetail.tsx` | Surfaces existing `project_updates` table data |

---

## Phase 2 — Competitive Differentiators

Require partial backend work or moderate UI effort.

| Feature | Status | File(s) | Notes |
|---|---|---|---|
| **Tenders & Awards** page | ✅ Done | `src/pages/dashboard/Tenders.tsx` | Phase A: reads from `alerts` table `category=construction`. Phase B (later): dedicated `tender_events` table |
| **Country Intelligence** list page | ✅ Done | `src/pages/dashboard/Countries.tsx` | Aggregates from existing `projects` data |
| **Country Detail** per-country dashboard | ✅ Done | `src/pages/dashboard/CountryDetail.tsx` | Uses `useProjects({ country })` + `useAlerts()` |

---

## Phase 3 — Enterprise / Power User Features

Heavier implementation or new infrastructure required.

| Feature | Status | File(s) | Notes |
|---|---|---|---|
| **Project Comparison** — side-by-side modal | 🔲 Todo | `src/components/projects/CompareModal.tsx`, `src/hooks/use-project-comparison.ts` | Entitlement-gated (free tier = upgrade CTA). RadarChart via Recharts |
| **Agent Scheduling UI** — cron schedule management | 🔲 Todo | TBD | Requires pg_cron or `scheduled_agent_runs` table. Design in separate sprint |
| **API Access** — programmatic access for Pro/Enterprise | 🔲 Todo | TBD | Requires `api_keys` table, rate limiting, docs page. Full sprint |
| **Contact Database** — unified cross-project contacts view | 🔲 Todo | TBD | `project_contacts` table is populated; build standalone page after validating data volume |
| **Tender Events Migration** — dedicated `tender_events` table | 🔲 Todo | `supabase/migrations/` | Replace Phase A alert-based query with proper schema |
| **Country Intel — Phase 2** — news sentiment + political risk per country | 🔲 Todo | TBD | Requires new edge function calling external APIs |
| **Team Collaboration** — shared workspaces for enterprise | 🔲 Todo | TBD | Requires `workspaces` table, team membership, shared project lists |
| **Weekly Digest Email Delivery** — email opt-in for digests | 🔲 Todo | TBD | Backend generates digests; add email delivery via Resend/Postmark |

---

## Backlog / Ideas

Captured ideas for future consideration. Not yet sized or prioritized.

| Idea | Origin | Notes |
|---|---|---|
| Trial timer / trial status in billing UI | Backend gap | Backend tracks `trial_end` but no UI surfaces it |
| Saved search / search alerts | User need | Save a filter combination, get notified when new projects match |
| Tender open/close notifications | Competitive | Alert when a project moves to Tender stage |

> Moved to Strategic Roadmap (above): NL search, executive one-pager PDF.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ Done | Fully implemented and tested |
| 🔄 In Progress | Currently being built |
| 🔲 Todo | Planned, not started |
| ⏸ Paused | Deprioritized, keep for later |
| ❌ Dropped | Decided not to build |
