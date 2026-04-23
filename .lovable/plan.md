

## Goal
Ship **Feature 2 — Natural Language Project Search** end-to-end: a new `/dashboard/ask` page where users type questions like *"Power projects in West Africa above $100M in tender stage"* and get matched projects from the live database. Existing search/filter UI stays untouched.

## What gets built

### 1. New edge function — `supabase/functions/nl-search/index.ts`
- Auth + AI-quota gate via existing `requireAiEntitlementOrRespond` (same metric as other AI features → 1 unit/call).
- Calls **Lovable AI Gateway** (`google/gemini-2.5-flash`) with a strict tool-call schema → returns structured filters (regions, sectors, stages, statuses, countries, value range, keyword, ordering) + a one-sentence interpretation.
- Server sanitizes against whitelists from `src/data/projects.ts` (no SQL injection — no raw SQL ever sent).
- Builds a typed Supabase query against `projects` (`approved=true` only), applies filters, returns up to 50 rows.
- Surfaces `429` (rate limit) and `402` (credits) errors back to the client.

### 2. New page — `src/pages/dashboard/Ask.tsx`
- Header with `Sparkles` icon + plain-English explanation.
- Single search input (max 500 chars) + **5 example prompts** as one-click pills.
- Loading state, "How I understood your question" interpretation strip with badges showing every applied filter, and a results grid (2-col on md+) of project cards linking to `/dashboard/projects/:slug`.
- Empty-state CTA pointing to `/dashboard/projects` (the classic filter view) so users always have a fallback.
- Quota-exhausted / rate-limit errors trigger the existing `<UpgradeDialog />`.

### 3. Wiring
- `src/lib/api/agents.ts` → add `agentApi.runNlSearch(query)`.
- `src/App.tsx` → register route `/dashboard/ask` (under `<DashboardLayout />`, no extra role guard — gated by AI quota only).
- `src/layouts/DashboardLayout.tsx` → add **"Ask AI"** nav item under Core (with `Sparkles` icon, `tourId: 'nav-ask'`). The existing header `<ProjectSearch />` (instant fuzzy match) is kept exactly as is.

### 4. Marketing pages — light touches
- `src/components/home/CapabilitiesSection.tsx`: replace the "Procurement monitoring" tile copy or add a 10th module **"Ask in plain English"** highlighting the new capability (linking to `/dashboard/ask` for signed-in users, `/login` otherwise).
- `src/pages/Pricing.tsx`: add a one-line bullet **"Natural-language project search"** to Starter / Pro / Lifetime feature lists (free tier sees it as upgrade copy via the existing AI-quota gate).

### 5. Docs
- Flip Feature #2 status in `FEATURES.md` and `docs/roadmap/STRATEGIC_FEATURES.md` from 🔲 Todo → ✅ Done with the acceptance-criteria checkboxes ticked.

## Data model & migrations
**None.** Reuses `public.projects` and the existing AI-quota infrastructure (`usage_counters`, `consume_quota` RPC, plan limits in `_shared/billing.ts`).

## Entitlement
Counts against `aiPerDay` (already defined): Free 2 / Trial 5 / Starter 20 / Pro 100 / Lifetime ∞. Free tier hitting the cap gets the existing UpgradeDialog flow.

## Files touched
| Type | Path |
|---|---|
| New | `supabase/functions/nl-search/index.ts` |
| New | `src/pages/dashboard/Ask.tsx` |
| Edit | `src/lib/api/agents.ts` |
| Edit | `src/App.tsx` |
| Edit | `src/layouts/DashboardLayout.tsx` |
| Edit | `src/components/home/CapabilitiesSection.tsx` |
| Edit | `src/pages/Pricing.tsx` |
| Edit | `FEATURES.md` |
| Edit | `docs/roadmap/STRATEGIC_FEATURES.md` |

## Out of scope (deferred)
- Saving search history to a `nl_search_history` table (mentioned as optional in the spec).
- Adding NL search to the global cmd+K palette (the existing header search stays).
- Public `/dashboard/ask` access for anonymous users — staying behind the dashboard auth wall for now.

## Acceptance criteria (will verify after build)
- [ ] "power projects in Nigeria over 100M" returns relevant projects with correct filter chips shown.
- [ ] Vague prompts return an interpretation + suggest broadening.
- [ ] Counts against AI quota (visible in `usage_counters`).
- [ ] Free tier sees UpgradeDialog after 2 queries.
- [ ] Mobile layout works (single-column cards, full-width input).
- [ ] Existing `<ProjectSearch />` in the dashboard header still works unchanged.

