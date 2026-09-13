# Clear roles + a personal AI analyst for every user

Two things: make it obvious what a customer sees versus what your research and admin team sees (and enforce it, not just hide it), and give every user their own always-on AI analyst.

## Part 1 — Who sees what

Three audiences, three clean areas:

**Customer (paid or free user)**
Overview, Ask AI, Alerts, Projects (incl. pipeline/compare/countries tabs), My Portfolio + Portfolio Chat, Geo Intelligence, Tenders & Awards + Calendar, People & Firms + Contractors, Report Studio, Settings, Billing history.

**Researcher (everything above, plus)**
Research, Evidence & Verification, Review Queue (incl. Needs a human, Source health), Agents, Insights management.

**Admin (everything above, plus)**
Users, Datasets, Growth (BD pipeline, Outreach, Subscribers, Feedback inbox), agent configuration.

Fixes needed:

- Settings currently sits inside the Admin menu group, so a normal customer has no visible way to reach their own settings. Move Settings (and billing history) into a personal "Account" area visible to everyone.
- Evidence & Verification, Insights management and the review sub-pages are hidden from the customer menu but still open if the URL is typed. Add real role checks on those pages.
- The role check today runs only in the browser. Add matching database rules so a customer can never read internal review, agent, dataset, growth or subscriber data even outside the app.
- Rename the "Research Operations" group to "Research desk" and "Admin" to "Administration" so the boundary reads clearly.
- A customer's own contact/company data access stays exactly as the existing paid gate defines it — unchanged.

## Part 2 — Personal AI analyst ("Your Analyst")

Verdict on the idea: worth building, and it is the strongest differentiator you have over a projects database. Competitors sell a searchable archive; a standing analyst that watches a user's specific patch and comes back with cited findings is a retention feature, and it reuses the agent framework, evidence and citation rules you already have.

Each user gets one analyst they configure once: regions, sectors, value range, stages, tracked projects, plus their own standing questions in plain language ("tell me when a hydrogen project in Egypt reaches tender").

The analyst does four things:

1. **Brief** — a daily or weekly written brief on their patch, every claim linked to a source.
2. **Watch** — continuously checks their interests and only speaks when something meaningful changes (stage moved, award made, value shifted, new project matching their pattern).
3. **Standing questions** — answers their saved questions on schedule, with sources.
4. **Auto-report** — drafts a full cited report each period, ready to download.

Delivery: an in-app **Your Analyst** inbox (each briefing readable with sources and a "not useful" thumbs-down that teaches it), email on their chosen schedule using the existing email system and unsubscribe handling, and meaningful findings also pushed into the existing Alerts feed.

Access: everyone gets an analyst. Free gets one weekly brief and a couple of standing questions; paid plans get daily briefs, more standing questions and the auto-report. Enforced by the same quota system that already meters AI use, so runaway cost isn't possible.

Guardrails, consistent with the rest of the platform: nothing without a source URL, no invented contacts, and anything the analyst can't decide confidently is flagged rather than asserted. If AI credits run out, briefs pause cleanly and resume, exactly like the existing agents.

## Technical notes

- Roles: add `RoleGuard requiredRole="researcher"` to `/dashboard/evidence`; move `Settings` + `/dashboard/billing/audit` out of the admin nav group into a new no-`minRole` "Account" group in `DashboardLayout.tsx`; keep `RoleGuard` but back it with RLS on the staff tables (review_actions, research_tasks, agent_config/events, datasets, bd_pipeline, subscribers, feedback) using `has_role(auth.uid(), ...)`.
- New tables (RLS scoped to `auth.uid()`, GRANTs for `authenticated` + `service_role`): `user_agents` (config, cadence, delivery channels, enabled), `user_agent_questions` (standing questions), `user_agent_briefings` (title, body, cited sources jsonb, kind: brief|watch|answer|report, read_at, feedback), plus cursor/state columns so runs are resumable.
- New edge function `personal-analyst` following the standard pattern: CORS → auth → `isAgentEnabled` → `beginAgentTask` → per-user bounded work → `finishAgentRun`, using `_shared/llm.ts` with `gatewayFailure()` for 402/403/429, `_shared/agentResearch.ts` (Firecrawl) for grounding, and `escalate_to_human` for anything unclear. Quotas via `consumeAiQuota`; plan caps added to both `_shared/billing.ts` and `src/lib/billing/limits.ts`.
- Client entry through `agentApi.*` in `src/lib/api/agents.ts` only. New page `src/pages/dashboard/Analyst.tsx` at `/dashboard/analyst` (lazy), added to the Command Center nav.
- Email via existing `send-transactional-email` with a new template + idempotency key per briefing; watch findings inserted as alerts with `origin: "ai_agent"`.
- Cron: hourly dispatcher that picks users whose next run is due (daily/weekly per plan), bounded batch size, per-user isolation.
