# Roadmap

- [x] Fix Review Queue tab overlap on laptop screens and verify every tab in the preview
- [x] Split Project Detail into focused files and verify its tabs in the signed-in preview
- [x] Auto-apply update proposals that genuinely improve a project (rules + batch backlog pass)
- [ ] Auto-merge duplicate projects (same normalised name + country) — SQL done, needs run + UI/schedule
- [ ] Escalation guardrails: every automated decision that is not clearly safe must escalate to a human review item (update proposals, duplicate merges, ingest auto-publish, contact discovery)
- [x] Code review step 1: remove dormant Paddle code + legacy usage helpers
- [x] Step 2: record silent failures (webhook now throws on upsert error so LS retries; unresolved-user / lifetime-grant failures persisted to billing_events; ingest agents already record failures)
- [x] Step 3: start/finish logging for digest, source-ingest, report, health-monitor agents
- [x] Step 4: "load more" for capped lists (Stakeholders, Outreach, Feedback)
- [ ] Step 5: remove type-check bypasses — 115→58; remainder target tables/functions missing from generated types (digests, agent_health_alerts, agent_health, pipeline summary, BDPipeline) or untyped research JSON — fix after types regenerate
- [x] Step 6: route all server calls through shared API helper (callFunction in src/lib/api/agents.ts; raw fetch kept only for file download + GET unsubscribe)
- [ ] Step 7: split oversized dashboard pages — AgentMonitoring config extracted (1128→1015); ReviewQueue split into per-tab files (1009→520); ProjectDetail tabs, scores and PDF extracted (982→488); remaining: Projects, Settings
- [x] Legal pages (Terms/Privacy/Refund) updated to Lemon Squeezy as Merchant of Record

## Frontier-first discovery plan (2026-10-13)
- [x] Sector focus weights (table + weighted theme picking in frontier agent), new power-for-AI / cooling / chip-supply / construction themes
- [x] Optional Exa provider in research router; default router mode `auto` (Perplexity → Exa → Firecrawl → Lovable AI)
- [x] Contact finder targets decision-maker roles
- [ ] Perplexity: key linked, Search API wired — blocked: account has no API credits (console.perplexity.ai billing)
- [ ] Exa key — blocked: waiting on user to add EXA_API_KEY
- [ ] Sector focus editor + coverage chart in Agents Hub
- [ ] Company watch-list agent, interconnection-queue and subsidy-award sources
- [ ] Contact email_status (verified / guessed / provider-verified)
- [ ] Report Studio: scope/sections/depth, templates, Excel export, credit preview, end-to-end test reports
- [ ] Re-tag existing "Infrastructure" rows into frontier/construction sectors
