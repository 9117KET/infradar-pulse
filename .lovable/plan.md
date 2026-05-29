# Clean broken sources & restore grounded research

## Problem

Since all agent research moved onto Lovable AI (`_shared/webResearch.ts` + `_shared/agentResearch.ts`), the models have no real web grounding and are inventing plausible-looking URLs. The database now has ~1,615 unique source URLs in `evidence_sources`, plus `projects.source_url` and `project_contacts.source_url`, many of which are broken or fabricated.

Public MDB ingest agents (World Bank, IFC, ADB, AfDB, AIIB, EBRD, IADB) still work — they hit real APIs. The breakage is concentrated in agents that go through `runResearchPrompt` / `fetchAgentResearch`: research-agent, regulatory-monitor, supply-chain-monitor, stakeholder-intel, market-intel, sentiment-analyzer, esg-social-monitor, security-resilience, corporate-ma-monitor, tender-award-monitor, funding-tracker, contact-finder, generate-insight, user-research.

## Plan

### Phase 1 — Audit & quarantine broken links

1. **New edge function `link-validator`** (admin-only, schedulable). Walks `evidence_sources.url`, `projects.source_url`, `project_contacts.source_url`, and `insights.sources[].url` in batches. For each unique URL: HEAD with 8s timeout, follow redirects, fall back to GET on 405. Classify as `ok` / `broken` / `skipped`.
2. **New table `source_link_checks`** stores last check per URL (`url`, `status`, `http_code`, `checked_at`, `error`). Idempotent; lets us re-run cheaply.
3. **Cleanup function `public.cleanup_broken_sources(dry_run boolean)`**:
   - Delete `evidence_sources` rows whose URL is broken AND `added_by = 'ai'` AND not linked from a verified project. Keep human-added rows but flip `verified = false`.
   - Null out `projects.source_url` and `project_contacts.source_url` when broken+AI-sourced; cap-downgrade `projects.confidence` by 10 when its only source is removed.
   - Strip broken entries from `insights.sources` JSON; if that empties the array, set `insights.published = false`.
4. **Admin UI** — new "Source Health" tab on `/dashboard/review`: summary counts, "Re-run validator" button, broken-URL table with project/insight backlinks. Destructive cleanup only via edge function with explicit confirm.

### Phase 2 — Reintegrate grounded research (Perplexity primary + Firecrawl specialist)

Replace the Lovable-only path in `_shared/webResearch.ts` and `_shared/agentResearch.ts` with a provider router (`_shared/researchRouter.ts`).

**Routing table:**

| Agent type | Primary | Fallback |
|---|---|---|
| Monitoring (regulatory, ESG, M&A, sentiment, supply-chain, security, market-intel, tender-monitor, funding-tracker) | Perplexity `sonar` | Firecrawl search |
| Deep research (research-agent, user-research, generate-insight) | Perplexity `sonar-pro` | Firecrawl search + scrape |
| Page extraction (contact-finder, data-enrichment, source-ingest) | Firecrawl scrape | Perplexity URL-targeted query |
| MDB ingest agents | Public APIs (unchanged) | — |
| Last-resort if both providers fail | Lovable AI narrative | confidence capped at 40, **no URLs written** |

**Why this split:** Perplexity returns real `citations[]` in one call → fixes hallucinated URLs cheaply for monitoring. Firecrawl gives full page text + structured JSON → required for contact/email extraction where snippets aren't enough.

**Public datasets first:** before any LLM call, research helpers query our own ingested MDB rows (`projects` + `raw_evidence` with `kind = 'mdb'`) and pass that as grounded context. Reduces hallucination and biases the model toward citing our verified URLs.

**URL hygiene at write time:** new `_shared/urlHygiene.ts` exports `assertValidSourceUrl()` that:
- Rejects non-http schemes, bare domains, `example.com`, placeholder patterns.
- Live HEAD check (on by default for agent writes, behind a flag).
- Logs rejections to `source_link_checks` so we can see which agent/model is producing junk.

Every insert into `evidence_sources`, `projects.source_url`, `project_contacts.source_url` goes through this helper.

### Phase 3 — Operationalize

- **Schedule `link-validator`** via pg_cron weekly; only re-checks URLs older than 7 days or previously broken.
- **Agent Health dashboard** gets a "Source quality" panel: broken-link rate per agent over last 7 days. Catches provider regressions early.
- **Provider switch** behind `RESEARCH_PROVIDER` env var (`auto` | `perplexity` | `firecrawl` | `lovable`) so we can pin/disable a provider without redeploying logic.

## Technical details

**Files to add**
- `supabase/functions/link-validator/index.ts`
- `supabase/functions/_shared/urlHygiene.ts`
- `supabase/functions/_shared/researchRouter.ts` (Perplexity → Firecrawl → Lovable AI)
- `supabase/functions/_shared/firecrawlClient.ts` (search + scrape wrappers via gateway)
- Migration: `source_link_checks` table + RLS (staff read, service-role write) + GRANTs
- Migration: `public.cleanup_broken_sources(dry_run boolean)` returning counts
- `src/pages/dashboard/SourceHealth.tsx` + route + researcher nav entry

**Files to change**
- `supabase/functions/_shared/webResearch.ts` → delegate to `researchRouter`
- `supabase/functions/_shared/agentResearch.ts` → return real `citations` from Perplexity instead of `[]`
- `supabase/functions/_shared/perplexity.ts` → restore real Perplexity calls (currently a shim into Lovable AI)
- All ~14 research-using agents → call `assertValidSourceUrl` before inserting any source URL
- `src/lib/api/agents.ts` → add `runLinkValidator`

**Connectors / secrets**
- Link Perplexity and Firecrawl via `standard_connectors--connect` — both gateway-enabled, no manual key entry.
- Keep `LOVABLE_API_KEY` for fallback narrative + extraction tasks.

**Out of scope**
- Re-running every agent to refill evidence after cleanup. Agents refill naturally on next scheduled run.
- Migrating MDB ingest agents (already correct).
- Removing Lovable AI (stays as fallback + for extraction/classification/summarization).

## Risk / rollout

1. Phase 1 dry-run: validator writes to `source_link_checks` only. `cleanup_broken_sources(dry_run := true)` reports counts. Review with user.
2. Run cleanup for real once counts look sane.
3. Phase 2 ships with `RESEARCH_PROVIDER=auto`. If Perplexity 429s spike, flip to `firecrawl`. If both providers fail, `lovable` keeps agents alive but produces no URLs (better than hallucinations).
4. Phase 3 cron scheduled only after a clean weekly validator run.
