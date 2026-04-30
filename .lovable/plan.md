# Agent Pipeline Audit — Findings & Plan

## Executive Summary

1. **The pipeline looks healthy from cron, but 7 monitor agents are silently dead since Apr 27-28.** Cron `job_run_details` shows everything "succeeded" because that only measures `net.http_post` returning a request_id — not whether the function ran. `agent_config.failure_count` tells the truth: regulatory-monitor 92.6% fail, supply-chain 92%, stakeholder-intel 91.5%, corporate-ma 75%, ESG 50%, tender-award 50%, security-resilience 33%.
2. **Root cause for ~80% of failures: `"No research text (set PERPLEXITY_API_KEY)"`**. Seven agents still hard-require Perplexity, violating the MVP rule (`docs/product/AGENT_ARCHITECTURE.md`: "agents must not require Perplexity… to complete"). Quota is exhausted (401 from Perplexity).
3. **Naming drift between cron jobs and agent gates** breaks the pause/resume contract. Cron job `risk-scorer` → gate writes to `risk-scoring`; `update-checker` → `update-check`; `research-agent` → `discovery`. Pausing from the dashboard won't actually stop the next cron tick.
4. **Insights are stale by 25 days** (`insights.updated_at` max = 2026-04-05). There is no cron job for `generate-insight` at all, even though a working agent and dashboard widget exist.
5. **Scheduling is over-eager for MVP traffic** (95 candidates, 1,671 projects, ~1 active researcher). `update-checker` and `data-enrichment` every 2h, `research-agent` every 30 min, `dataset-refresh` every hour with 1 row in the table — burns AI tokens with no proportional accuracy gain.

---

## Discovery Findings (Step 1)

### Cron schedule vs. real outcomes (last 7 days)

```text
Agent                      Cron              Cron OK   Real status         Last real run
research-agent             */30 * * * *      336       OK (discovery)      2026-04-30 18:45
process-email-queue        5 sec             119,945   OK                  now
update-checker             0 */2 * * *       84        OK (stuck-running)  2026-04-30 18:35
data-enrichment            0 */2 * * *       84        OK (stuck-running)  2026-04-30 18:35
sentiment-analyzer         45 */2 * * *      84        OK                  2026-04-28 19:49 (3d stale)
dataset-refresh            15 * * * *        63        partial             2026-04-30 18:39 (3 fails)
contact-finder             0 */3 * * *       56        OK (stuck-running)  2026-04-30 18:37
regulatory-monitor         15 */3 * * *      55        92.6% FAIL          2026-04-28 19:49 (Perplexity)
alert-intelligence         0 */4 * * *       42        OK                  2026-04-28 13:42 (2d stale)
risk-scorer                0 */4 * * *       42        OK (named risk-scoring) 2026-04-28 13:42
funding-tracker            30 */4 * * *      42        OK                  2026-04-28 04:30 (2d stale)
supply-chain-monitor       0 1,5,9,13,17,21  42        92.0% FAIL          2026-04-28 19:49 (Perplexity)
stakeholder-intel          0 */6 * * *       28        91.5% FAIL          2026-04-28 08:52 (Perplexity)
market-intel               30 0,6,12,18      28        OK                  2026-04-28 00:30
esg-social-monitor         25 */4 * * *      16        50% FAIL            2026-04-28 19:49 (Perplexity)
security-resilience        35 */4 * * *      16        33% FAIL            2026-04-28 19:49 (Perplexity)
tender-award-monitor       50 */4 * * *      16        50% FAIL            2026-04-28 19:49 (Perplexity)
corporate-ma-monitor       20 */6 * * *      11        75% FAIL            2026-04-28 08:51 (Perplexity)
{world-bank,ifc,adb,afdb,ebrd,iadb,aiib}-ingest  daily    OK     mixed   adb fails on dead CSV URL
entity-dedup               40 6 * * *        3         OK                  2026-04-30 21:28
digest-agent               10 7 * * *        3         OK after fix        2026-04-30 21:33
report-agent               20 7 * * 1        0         never               (weekly, due Mon)
executive-briefing         0 8 * * *         3         OK                  2026-04-27 12:11 (3d stale)
insight-sources-agent      none              n/a       OK on-demand        2026-04-30 21:39
generate-insight           NONE              n/a       NEVER SCHEDULED     insights stale 25 days
```

### Data freshness today

| Table | Last write | Rows |
|---|---|---|
| projects | 2026-04-30 18:38 | 1,671 |
| project_candidates | 2026-04-30 21:28 | 95 |
| alerts | 2026-04-30 18:41 | 5,541 |
| project_contacts | 2026-04-30 18:41 | 4,446 |
| evidence_sources | 2026-04-30 | 2,060 |
| raw_evidence | 2026-04-30 18:45 | 98 |
| **insights** | **2026-04-05** | **12** |
| dataset_snapshots | 2026-04-30 18:39 | 1 |

### Critical bugs found

- **3 stuck `running` tasks** from 2026-04-30 18:35-18:37 (contact-finder, data-enrichment, update-check) — no timeout reaper.
- **`dataset_refresh` schema cache miss** (`Could not find table public.dataset_snapshots`) — appears resolved but logged 2 fails.
- **`adb-ingest`** fails on hardcoded CSV URL: "Could not locate ADB CSV dataset via CKAN API".
- **`aiib-ingest`** has never run (`agent_config.last_run_at = null`) despite cron firing 3× this week.
- Cron uses `_agent_cron_auth_header()` reading from vault → ✅ service-role JWT, not anon. **No violations.**

### Agent → downstream feature map

| Feature | Fed by |
|---|---|
| Dashboard Overview / Map | `projects` ← world-bank/ifc/adb/afdb/ebrd/iadb/aiib-ingest, research-agent, data-enrichment |
| Alerts page + Alert Intelligence | `alerts` ← regulatory, supply-chain, stakeholder, ESG, tender-award, security-resilience, corporate-ma, sentiment, update-checker; `alert-intelligence` classifies |
| Insights | `insights` ← generate-insight (**unscheduled**); `insight-sources-agent` enriches citations |
| Verification / Review Queue | `project_candidates`, `quality_scores`, `raw_evidence`, `project_claims` ← research-agent, entity-dedup |
| Contacts / Stakeholder Intel | `project_contacts` ← contact-finder, stakeholder-intel |
| Reports / Digests / Briefings | `digests`, weekly report-agent (Mon), executive-briefing |
| User-facing AI | nl-search, portfolio-chat, user-research (on-demand only ✅) |

---

## Per-Agent Recommendation Table (Step 3)

| Agent | Current cron | Recommended | Why | Accuracy fix | Cost fix | Feeds | Verdict |
|---|---|---|---|---|---|---|---|
| **research-agent** | */30 min | `0 */2 * * *` (every 2h) | 95 candidates / 1 user — 30min is overkill | Require ≥2 evidence rows before promoting candidate→project | Skip if no new raw_evidence in last run window; gemini-flash-lite | candidates, projects | **Reduce** |
| **world-bank-ingest** | daily 03:00 | weekly Mon 03:00 | WB updates daily but our consumption is weekly | Dedupe by external_id before insert | Limit 100/run | projects | **Reduce** |
| **ifc-ingest** | daily 03:30 | weekly Tue 03:30 | same | same | same | projects | **Reduce** |
| **adb-ingest** | daily 04:00 | **paused** until URL fixed | Hard-coded CSV URL is dead | Fix CKAN endpoint resolution | n/a | projects | **Pause+fix** |
| **afdb/ebrd/iadb-ingest** | daily | weekly | low data volume | dedupe | limit 100 | projects | **Reduce** |
| **aiib-ingest** | daily 06:00 | **paused** | Never successfully run | Investigate first | n/a | projects | **Pause+investigate** |
| **data-enrichment** | every 2h | `0 */6 * * *` | 1,671 projects, slow churn | Enrich only projects missing ≥3 fields | Cap 20 projects/run; flash-lite | projects | **Reduce** |
| **update-checker** | every 2h | `0 8,20 * * *` (2×/day) | Confidence decay is daily-grain | Require source URL on every update_proposal | Cap 50 → 25 projects/run | project_updates, alerts | **Reduce** |
| **contact-finder** | every 3h | `0 */12 * * *` | 4,446 contacts already; diminishing returns | Reject contacts without source_url + email/phone | Cap 10 projects/run | project_contacts | **Reduce** |
| **entity-dedup** | daily 06:40 | daily ✅ | Only 95 candidates, 1,671 projects — keeps growing | Block research-agent insert if dedup score >85 | Already cheap | candidates, projects | **Keep** |
| **alert-intelligence** | every 4h | every 6h | Classifies; 161 success, 0 fail | Batch all unclassified alerts in one AI call | Single batched call vs per-alert | alerts | **Reduce** |
| **risk-scorer** | every 4h | daily 12:00 | Risk scores don't move hourly | Require evidence delta before re-scoring | flash-lite | projects.risk_score | **Reduce** |
| **funding-tracker** | every 4h | every 12h | DFI funding changes weekly | Require ≥1 evidence_source per alert | cap 20 projects | alerts | **Reduce** |
| **market-intel** | 4×/day | daily | Competitor news cadence | dedupe by quote hash | flash-lite | alerts | **Reduce** |
| **regulatory-monitor** | every 3h | **paused** until Lovable AI migration | 92.6% failing on Perplexity | Migrate to `webResearch.ts` | LovableAI only | alerts | **Fix+Reduce to daily** |
| **supply-chain-monitor** | 6×/day | **paused** until LovableAI | 92% failing | same | same | alerts | **Fix+Reduce to daily** |
| **stakeholder-intel** | every 6h | **paused** until LovableAI | 91.5% failing | same | same | alerts | **Fix+Reduce to weekly** |
| **corporate-ma-monitor** | every 6h | **paused** until LovableAI | 75% failing | same | same | alerts | **Fix+Reduce to weekly** |
| **esg-social-monitor** | every 4h | **paused** until LovableAI | 50% failing | same | same | alerts | **Fix+Reduce to daily** |
| **tender-award-monitor** | every 4h | **paused** until LovableAI | 50% failing | same | same | alerts | **Fix+Reduce to every 6h** |
| **security-resilience** | every 4h | **paused** until LovableAI | 33% failing | same | same | alerts | **Fix+Merge into regulatory** |
| **sentiment-analyzer** | every 2h | every 12h | 613 success — running on every alert is wasteful | Only score alerts created in last window | flash-lite, batch 20 alerts/call | alerts.sentiment | **Reduce** |
| **dataset-refresh** | every hour | daily 00:30 | 1 snapshot row total; hourly is theatre | n/a | n/a | dataset_snapshots | **Reduce** |
| **digest-agent** | daily 07:10 | daily ✅ | User-facing email | Require ≥3 alerts to send | Skip users with 0 new alerts | digests, emails | **Keep** |
| **executive-briefing** | daily 08:00 | weekly Mon 08:00 | Executive briefings aren't daily-cadence | Cite ≥5 sources | flash-lite | reports | **Reduce** |
| **report-agent** | weekly Mon | weekly ✅ | Has never run yet — verify first Monday | n/a | n/a | reports | **Keep+verify** |
| **generate-insight** | **NONE** | `0 9 * * 2,5` (2×/week) | Insights stale 25 days; no cron exists | Must cite ≥3 evidence_sources | flash-lite | insights | **ADD CRON** |
| **insight-sources-agent** | on-demand | on-demand ✅ | Triggered after insight publish | Already enforces source links | already cheap | insights.sources | **Keep** |
| **nl-search / portfolio-chat / user-research** | on-demand | on-demand ✅ | User-triggered | Already gated by entitlement | already gated | UI | **Keep** |
| **demo-followup-scheduler** | none visible | keep on-demand | Sales tool | n/a | n/a | emails | **Keep** |

---

## Top 5 Quick Wins (each ≤1 day)

1. **Fix the 7 Perplexity-dependent agents.** Replace `runResearchPrompt` Perplexity branch with `_shared/webResearch.ts` (LovableAI). Agents: regulatory, supply-chain, stakeholder, corporate-ma, esg, tender-award, security-resilience. Removes ~80% of total failures and lets 6 dead monitors come back online.
2. **Reconcile agent_type names.** Either rename `agent_config.agent_type` rows or rename function-side gate calls so cron job `risk-scorer` ↔ `agent_config.risk-scoring` align. Today the dashboard pause toggle for `risk-scoring` does not stop the `risk-scorer` cron because the gate-key mismatch hides nothing — but it does mean run history is fragmented across two keys for some agents.
3. **Add `generate-insight` cron** (`0 9 * * 2,5`) so the Insights page stops looking abandoned. Use last 7 days of new alerts + projects as input.
4. **Add a stuck-task reaper.** A 5-min `pg_cron` job that flips `research_tasks` rows still `running` after 10 minutes to `failed` and clears the agent lock. Currently 3 are stuck since 18:35.
5. **Pause adb-ingest and aiib-ingest** in `agent_config` until the CSV URL / endpoint is fixed. Stop generating alert noise on the AgentMonitoring dashboard.

## Top 3 Risks

1. **Silent failure looks like success on cron** — the Overview dashboard says "all agents running" but 7 are dead. Need a real health view that reads `agent_config.last_run_status` + `last_run_at < now() - interval` rather than cron status.
2. **Stuck `running` tasks block the agent gate.** `agentGate.beginAgentTask` returns `alreadyRunning` if a prior run is still flagged running — so contact-finder/data-enrichment/update-check **cannot run again until manually cleared**. This is why `update-checker` shows `last_run_status: running` for 3+ hours.
3. **No AI usage cap on agents.** A misconfigured loop could burn the LovableAI gateway quota. Recommend per-agent daily token budget tracked in a new `agent_ai_usage` table.

## Schedule Conflicts / Overlaps to Fix

- **alert-intelligence (every 4h) overlaps every monitor agent's output window.** It can run while monitors are still inserting — fine, but means alerts get classified, then re-classified next cycle if monitors arrive late. Fix: run alert-intelligence at minute 50 of every monitor's hour.
- **research-agent every 30 min + entity-dedup once daily** = 47 research runs accumulate dupes before dedup catches up. Move dedup to `0 */6 * * *`.
- **regulatory-monitor + security-resilience overlap heavily** on permits/sanctions/cyber-of-critical-infra. Recommend merging when both are migrated to LovableAI.

## Missing Wiring

- **insights** table not fed by any cron → Insights page is stale.
- **`project_recheck_findings`** table exists but no agent named `project-recheck-agent` is in `supabase/functions/`. Either build it or drop the table from the schema.
- **`quality_scores`** is populated only by research-agent on insert; no nightly recompute when evidence changes.

## Suggested `agent_config` defaults for MVP launch

```text
enabled = true:
  research-agent, entity-dedup, data-enrichment, update-checker,
  contact-finder, alert-intelligence, risk-scorer, funding-tracker,
  market-intel, sentiment-analyzer, dataset-refresh, digest-agent,
  generate-insight, insight-sources-agent, world-bank-ingest, ifc-ingest

enabled = false (until fix):
  adb-ingest, aiib-ingest,
  regulatory-monitor, supply-chain-monitor, stakeholder-intel,
  corporate-ma-monitor, esg-social-monitor, tender-award-monitor,
  security-resilience
```

## Monitoring gaps

- Cron `success` is meaningless for accuracy — need `agent_health` view: `enabled AND last_run_at > now() - 2*interval AND last_run_status = 'completed'`.
- Several agents don't update `agent_config` at all (only writes to `research_tasks`). Audit list: `executive-briefing`, `report-agent`, `digest-agent`, `dataset-refresh-agent` — verify all call `finishAgentRun`.
- No `recordAgentEvent` calls in `nl-search`, `portfolio-chat` — but those are on-demand so OK.

---

## Phased Rollout Plan

### Week 1 — Free wins (no new infra, just cron + config + small code patches)

- Switch the 7 Perplexity-dependent monitors to `_shared/webResearch.ts` (LovableAI gemini-flash-lite).
- Update `cron.job` schedules per the table above (single migration of `cron.unschedule` + `cron.schedule`).
- Add `generate-insight` cron (Tue/Fri 09:00).
- Add stuck-task reaper cron (every 5 min).
- Pause adb/aiib ingest in `agent_config`.
- Fix dataset_snapshots / digests schema-cache issues (likely just a redeploy, but verify).

Expected impact: failure rate from ~20% global → <5%; Insights page fresh; estimated ~60% AI token reduction from frequency cuts.

### Week 2 — Refactors

- Reconcile agent_type names across cron + agent_config + agentGate.
- Add per-agent token budget table + check in `_shared/llm.ts`.
- Build `agent_health` view + wire into AgentMonitoring dashboard so cron-success theatre stops.
- Batch alert-intelligence and sentiment-analyzer (one AI call per N alerts instead of N calls).
- Add `quality_scores` nightly recompute.

### Week 3+ — Deferred (only after customer pull)

- Re-enable per-customer escalations to higher-frequency monitors for paid plans.
- Optional Firecrawl / Perplexity as enrichment, behind feature flag, for premium tier only.
- Merge security-resilience into regulatory-monitor once LovableAI quality is verified.
- Build `project-recheck-agent` (or drop the table).

---

## Files / Tables Cited

- `supabase/functions/{regulatory,supply-chain,stakeholder,corporate-ma,esg-social,tender-award,security-resilience}-monitor/index.ts` — Perplexity dependency to remove
- `supabase/functions/_shared/{webResearch.ts,llm.ts,agentGate.ts}` — replacement helpers
- `supabase/functions/adb-ingest-agent/index.ts` — broken CSV URL
- `supabase/functions/aiib-ingest-agent/index.ts` — never-runs investigation
- `supabase/functions/generate-insight/index.ts` — needs cron
- `cron.job` — schedule rewrites
- `public._agent_cron_auth_header()` — verified ✅ uses vault service-role
- `agent_config`, `research_tasks`, `cron.job_run_details` — naming + reaper fixes
- `src/pages/dashboard/AgentMonitoring.tsx` — switch from cron-status to agent_health view

Approve this plan and I'll execute Week 1 in default mode: code patches to the 7 monitors, the cron migration, the stuck-task reaper, the generate-insight schedule, and pausing the broken ingests.
