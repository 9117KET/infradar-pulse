

## Goal

Create a permanent, build-ready specification for the **Top 5 strategic features** identified in the previous analysis, so any future session (or contributor) can pick up an item and ship it without re-deriving the design. Also wire these items into the existing `FEATURES.md` tracker so progress is always visible.

## Deliverables

### 1. New file: `docs/roadmap/STRATEGIC_FEATURES.md`

A single source-of-truth document with one section per feature. Each section follows the same template so it reads like a build ticket:

```text
## Feature N — <Name>
- Status: 🔲 Todo | 🔄 In Progress | ✅ Done
- Why it matters (1-2 lines)
- User-facing surface (route, component, entry point)
- Data model (new tables / columns / RPCs)
- Backend (edge functions, cron, external APIs)
- Frontend (pages, hooks, components to create or edit)
- Entitlement / pricing gate
- Acceptance criteria (checklist)
- Estimated effort
- Files to touch (with paths)
```

The five features documented:

| # | Feature | Primary surface |
|---|---|---|
| 1 | **Weekly Email Digest Delivery** | Resend integration + `digest_subscriptions` table + cron schedule |
| 2 | **Natural Language Project Search** | New `/dashboard/ask` page + `nl-search` edge function (Lovable AI → SQL filter translator) |
| 3 | **Win-Probability Score per Project** | `project_scores` table + `win-probability-agent` edge function + ProjectDetail badge |
| 4 | **Executive One-Pager PDF Export** | Reuse `report-agent` pattern, add `project-onepager` edge function + Download button on ProjectDetail |
| 5 | **Public REST API + Webhooks** | `api_keys` table, `api/v1/*` edge functions with rate-limit, `webhook_subscriptions` table, `/dashboard/api-access` page |

For each, the doc lists the **exact files to create/edit** referencing the existing patterns already in the codebase:
- Edge function template → mirror `supabase/functions/report-agent/index.ts` (uses `agentGate`, `getUserFromBearer`, `assertAiAllowed`, `incrementUsage`)
- Client invocation → add to `src/lib/api/agents.ts` under `agentApi.*`
- Entitlement gating → extend `src/lib/billing/limits.ts` + mirror in `supabase/functions/_shared/billing.ts`
- New routes → register in `src/App.tsx` and `NAV_GROUPS` in `src/layouts/DashboardLayout.tsx`
- Pricing tier mapping → update `useEntitlements.ts` capability flags (`canUseNlSearch`, `canExportOnePager`, `canAccessApi`)

### 2. Update `FEATURES.md`

- Add a new top-level section **"Strategic Roadmap (see `docs/roadmap/STRATEGIC_FEATURES.md`)"** with a compact 5-row checklist table that mirrors the statuses in the strategic doc — so the existing tracker stays the at-a-glance index.
- Move the relevant entries currently in **Backlog / Ideas** ("Natural language project search", "Executive one-pager PDF") into the new section so we don't have duplicates.
- Keep the existing Legend.

### 3. Cross-references

- Add a one-line pointer at the top of `docs/roadmap/STRATEGIC_FEATURES.md` back to `FEATURES.md` and to `CLAUDE.md` (for the edge-function shared-utility patterns) so a fresh session knows where to read the conventions before coding.
- In each feature section, link to the **closest existing implementation** to copy from (e.g. Feature 4 → "model on `report-agent`"; Feature 1 → "model on `digest-agent` + `process-email-queue`").

## Out of scope (intentionally)

- No code changes to actual features yet — this turn is documentation only.
- No new tables created — schemas are *specified* in the doc, applied later when each feature is built.
- No pricing copy changes on `Pricing.tsx` — those happen when each feature ships.

## How to use the doc afterwards

When the user (or a future session) says "let's build the win-probability score":
1. Open `docs/roadmap/STRATEGIC_FEATURES.md` → Feature 3.
2. Follow the file-by-file build list and acceptance criteria.
3. Flip the status to 🔄, then ✅, in **both** the strategic doc and `FEATURES.md`.

