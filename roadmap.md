# Roadmap

- [x] Auto-apply update proposals that genuinely improve a project (rules + batch backlog pass)
- [ ] Auto-merge duplicate projects (same normalised name + country) — SQL done, needs run + UI/schedule
- [ ] Escalation guardrails: every automated decision that is not clearly safe must escalate to a human review item (update proposals, duplicate merges, ingest auto-publish, contact discovery)
- [x] Code review step 1: remove dormant Paddle code + legacy usage helpers
- [ ] Step 2: record silent failures (checkout completion, ingest agents)
- [ ] Step 3: start/finish logging for digest, source-ingest, report, health-monitor agents
- [ ] Step 4: "load more" for capped lists (Stakeholders, Outreach, Feedback)
- [ ] Step 5: remove type-check bypasses (regenerate types)
- [ ] Step 6: route all server calls through shared API helper
- [ ] Step 7: split oversized dashboard pages
- [ ] Legal pages (Terms/Privacy/Refund) still name Paddle as Merchant of Record — awaiting user wording
