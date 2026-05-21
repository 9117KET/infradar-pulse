# Lovable Coding Agent Session — InfraRadarAI Agent Framework

> **Tool:** [Lovable](https://lovable.dev) — AI coding agent for full-stack web apps (React + Vite + Supabase Edge Functions + Postgres).
> **Project:** InfraRadarAI (https://infradarai.com)
> **Scope of this transcript:** Curated multi-session log covering the build of our **50+ specialised AI agent suite** — from a single research agent to a full ingest + monitoring + verification framework powering 1,671 verified infrastructure projects across 140 countries and a $246B+ pipeline.
>

---

## Phase 1 — First agent: `research-agent`

**Prompt:**
> Build a Supabase edge function called `research-agent` that uses an LLM to discover infrastructure projects in a given country, extract structured fields (name, sector, value_usd, status, source_url), and insert them into a `projects` table. Require a source URL on every project. Cap confidence at 30 if the source can't be verified.

**Lovable produced:**
- `supabase/functions/research-agent/index.ts`
- Migration creating `projects` table with `confidence_score`, `source_url`, `verification_status`
- RLS policies (public read for verified, staff write)

**Key insight from the session:** Lovable correctly suggested splitting the LLM call into a shared module from day 1 — which became the foundation for everything below.

---

## Phase 2 — Extracting the shared agent framework

By the time we had 4 agents (`research-agent`, `risk-scorer`, `funding-tracker`, `regulatory-monitor`), each was duplicating: CORS, JWT validation, "is this agent paused?" check, quota enforcement, LLM call.

**Prompt:**
> Refactor all current agents to share a common pattern. Create `supabase/functions/_shared/` with:
> - `agentGate.ts` — `isAgentEnabled(supabase, agentType)` reading from `agent_config` table
> - `auth.ts` — `getUserFromBearer()`
> - `entitlementCheck.ts` — `assertAiAllowed`, `incrementUsage` enforcing per-plan daily/hourly caps
> - `llm.ts` — `chatCompletions(body)` wrapping the Lovable AI gateway, reading `LOVABLE_API_KEY`
> - `agentResearch.ts` — source-aware research helper
>
> Then update every existing agent to follow this flow:
> CORS → admin client → isAgentEnabled → getUserFromBearer → assertAiAllowed → business logic → incrementUsage → update research_tasks.

**Result:** Every subsequent agent followed this template in ~15 minutes instead of ~2 hours. The framework is documented in `CLAUDE.md` for future contributors.

Files created in this session:
- `supabase/functions/_shared/agentGate.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/entitlementCheck.ts`
- `supabase/functions/_shared/llm.ts`
- `supabase/functions/_shared/agentResearch.ts`
- `supabase/functions/_shared/billing.ts`
- `supabase/functions/_shared/requireStaff.ts`

---

## Phase 3 — MDB ingest framework (1 → 7 agents)

The hardest single problem. Each multilateral development bank (World Bank, IFC, ADB, AfDB, EBRD, AIIB, IADB) publishes project data in a different format — REST API, paginated HTML, JSON-LD, CSV dumps. Some require pagination via `offset`, some via cursor, some via date windows.

**Prompt 1:**
> Build `world-bank-ingest-agent` that calls the WB Projects API, paginates with `status`, `limit`, `offset` params, normalises each row into our `projects` schema (mapping their sector codes to ours), dedupes by `external_id`, and writes back. Use the shared `_shared/` modules.

**Prompt 2 (after WB worked):**
> Now generalise the ingest pattern. I want to add 6 more MDBs: IFC, ADB, AfDB, EBRD, AIIB, IADB. Each will have its own edge function but they should share:
> - A `MDBIngestSource` interface (fetchPage, parseRow, mapSector)
> - Common dedup logic on `(source_key, external_id)`
> - Common stats reporting (rows_fetched, rows_inserted, rows_updated, rows_skipped)
>
> Build IFC first using this pattern, then I'll review before we do the rest.

**Result:** Once IFC was reviewed and merged, ADB + AfDB + EBRD + AIIB + IADB shipped in a single follow-up session. All 7 are listed in `agentApi` (`src/lib/api/agents.ts`) and visible on the AgentMonitoring dashboard.

Production stats from these 7 agents:
- 1,671 verified projects across 140 countries
- $246B+ indexed pipeline value
- Refresh cadence: daily via pg_cron

---

## Phase 4 — Monitoring agent suite (12 agents)

**Prompt:**
> I need a suite of monitoring agents that run on schedule and emit `alerts` (typed risk signals) tied to projects in our database. Each is one edge function:
>
> 1. `tender-award-monitor` — tender awards, cancellations, re-tenders, disputes
> 2. `funding-tracker` — DFI commitments, project finance closings
> 3. `risk-scorer` — overall project risk score
> 4. `regulatory-monitor` — EIA, permits, sanctions, policy
> 5. `supply-chain-monitor` — commodity & logistics risks
> 6. `stakeholder-intel` — contractor/agency/governance risk
> 7. `sentiment-analyzer` — media sentiment, controversy
> 8. `security-resilience` — cyber, outage, critical-infra security
> 9. `esg-social-monitor` — ESG, climate litigation, social licence
> 10. `corporate-ma-monitor` — ownership / JV / M&A changes
> 11. `market-intel` — competitor bid & award intelligence
> 12. `alert-intelligence` — classifies all alerts into 9 risk-signal categories and computes 30-day trend analytics
>
> All must use the shared `_shared/` framework, all must be pauseable from `agent_config`, all must write `research_tasks` rows for observability.

**Result:** 12 agents shipped in one extended session. Today they have produced **5,657 classified alerts** across the 9 categories.

---

## Phase 5 — User-facing AI (NL search, chat, reports)

**Prompts (over 3 sessions):**
> Build `nl-search` — translates a free-text user query into safe structured filters on the projects table. Whitelist filterable columns. Never let the LLM emit raw SQL.

> Build `portfolio-chat` — answers questions over a user's tracked portfolio. Stream tokens via SSE. Pull context from `tracked_projects` + recent alerts before calling the LLM.

> Build `report-agent` — generates a markdown intelligence report given `report_type`, `days`, `country`, `region`, `sector`, `stage`. Cite source URLs for every claim.

**Outcome:** Three of the most differentiated user features in the product. The "Ask in plain English" feature is the #1 thing prospective customers comment on in demos.

---

## Phase 6 — Operational hardening

Three production lessons that became their own Lovable sessions:

**Session 6a — pg_cron auth bug:**
> Cron jobs invoking edge functions are failing with 401. The anon key works for one-off invocations but not for cron. Fix this properly.

→ Lovable surfaced that pg_cron should use the service-role JWT pulled from Supabase Vault, not the anon key. Now stored in our memory file `mem://architecture/agent-cron-auth` so it never recurs.

**Session 6b — Leaflet + React 18 context errors:**
> Map markers crash with "Invalid hook call" inside react-leaflet popups under React 18.

→ Switched to native Leaflet API + raw HTML for markers. Saved as `mem://tech-stack/geospatial`.

**Session 6c — Verification audit trail:**
> Researchers are flipping `verification_status` without recording why. Add a mandatory reason field, write every change to `verification_audit_log`, and surface the history in the project drawer.

→ Migration + RLS + trigger + UI shipped in one session.

---

## What this session demonstrates

1. **Framework thinking, not vibe-coding.** The shared `_shared/` modules turned a linear cost (per-agent build time) into a sub-linear one. Adding agent #30 was faster than agent #5.
2. **Lovable handles the full stack in one tool** — Postgres migrations, RLS policies, edge functions, React UI, and shared TypeScript types all in the same session, all type-checked end-to-end.
3. **Memory + repo files (`CLAUDE.md`, `mem://`) make Lovable repeatable across sessions** — the agent doesn't relearn our conventions every chat.
4. **Cost moat:** every agent runs on the Lovable AI gateway (Gemini 3 / GPT-5 class) with `LOVABLE_API_KEY` auto-provisioned. No Perplexity / Firecrawl / OpenAI keys required for the baseline pipeline. Near-zero marginal LLM cost.

---

## Repo pointers (for reviewers)

- Agent framework: `supabase/functions/_shared/`
- 7 MDB ingest agents: `supabase/functions/{world-bank,ifc,adb,afdb,ebrd,aiib,iadb}-ingest-agent/`
- 12 monitoring agents: `supabase/functions/{tender-award-monitor,risk-scorer,funding-tracker,...}/`
- User-facing AI: `supabase/functions/{nl-search,portfolio-chat,report-agent,executive-briefing}/`
- Client-side invocation surface: `src/lib/api/agents.ts`
- Architecture doc: `docs/product/AGENT_ARCHITECTURE.md`
- Conventions for future AI sessions: `CLAUDE.md`
