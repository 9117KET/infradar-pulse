# Roadmap

- [x] Auto-apply update proposals that genuinely improve a project (rules + batch backlog pass)
- [ ] Auto-merge duplicate projects (same normalised name + country) — SQL done, needs run + UI/schedule
- [ ] Escalation guardrails: every automated decision that is not clearly safe must escalate to a human review item (update proposals, duplicate merges, ingest auto-publish, contact discovery)
- [x] Code review step 1: remove dormant Paddle code + legacy usage helpers
- [x] Step 2: record silent failures (webhook now throws on upsert error so LS retries; unresolved-user / lifetime-grant failures persisted to billing_events; ingest agents already record failures)
- [x] Step 3: start/finish logging for digest, source-ingest, report, health-monitor agents
- [x] Step 4: "load more" for capped lists (Stakeholders, Outreach, Feedback)
- [ ] Step 5: remove type-check bypasses — 115→58; remainder target tables/functions missing from generated types (digests, agent_health_alerts, agent_health, pipeline summary, BDPipeline) or untyped research JSON — fix after types regenerate
- [x] Step 6: route all server calls through shared API helper (callFunction in src/lib/api/agents.ts; raw fetch kept only for file download + GET unsubscribe)
- [ ] Step 7: split oversized dashboard pages — AgentMonitoring config extracted (1128→1015); ReviewQueue helpers extracted (1009→959); next: ProjectDetail, Projects, Settings
- [x] Legal pages (Terms/Privacy/Refund) updated to Lemon Squeezy as Merchant of Record
