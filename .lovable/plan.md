# From database to intelligence: Report Studio + Analyst Layer

Goal: make InfradarAI feel like an AI infrastructure analyst that tells users *what matters and why*, and let any subscriber generate the kind of report competitors sell for thousands — on their own filters, in minutes.

## Where we are today (verified)

- `report-agent` already generates 5 report types (country market, sector pipeline, tender & awards outlook, portfolio risk brief, weekly snapshot) with citations into `report_runs`, and `report_shares` supports public read-only links.
- But it is **staff-only** (`requireStaffOrRespond`), and the Reports page hardcodes one button that always runs `weekly_market_snapshot`. Users cannot choose a report type, scope it to their tracked projects, or pay for it.
- PDF export is a plain text dump of the markdown — not a sellable artifact.

So the engine exists; the product around it does not. That gap is the whole opportunity.

## Phase 1 — Self-serve Report Studio (the revenue unlock)

A `/dashboard/reports` builder where a user picks:

- Report type (the 5 existing templates + "Custom brief" from a free-text question)
- Scope: country / region / sector / stage / value band, or "my tracked projects" / a saved search
- Time window and depth (Brief ~3 pages, Standard ~10, Deep-dive ~25)

Then: run, watch live status, read in-app, download branded PDF, share a link, or schedule it (weekly/monthly, delivered by email via the existing digest/email queue).

Backend changes:
- Open `report-agent` to authenticated users through the AI entitlement gate (`requireAiEntitlementOrRespond`) instead of staff-only; keep staff bypass.
- Persist the scope/params and depth on `report_runs` so a report is reproducible and re-runnable.
- Add report quota per plan (e.g. free: preview only, starter: 2/mo, pro: 15/mo, enterprise: unlimited) alongside existing AI/export limits.

## Phase 2 — Reports worth paying for

- **Branded PDF**: cover page, scope summary, KPI dashboard, charts (pipeline by stage/sector, value curve, risk heatmap), findings with inline numbered citations, source appendix with confidence scores and last-verified dates, watermark with the buyer's name.
- **Evidence-first writing rule**: every claim in a report must map to a project record or a cited source. No source, no sentence. This is the trust story the LLM conversation flagged.
- **Free preview → paid unlock**: anyone can generate the executive summary + counts; the full report requires a plan. That's the conversion loop.

## Phase 3 — Actual intelligence (the differentiator)

Layered on the report engine and the existing agents:

1. **Stall / slippage prediction** — score each project's probability of delay or cancellation from stage-transition history (`project_health_history`, `project_updates`, `tender_events`), funding signals, and alert density. Surface as "Likely to stall in the next 6 months" with the reasons behind the score.
2. **Opportunity windows** — for a contractor/supplier persona, rank projects by *time-to-decision*: which are entering tender or award in the next 90 days, who the decision-maker is (from canonical `contacts`), and what to do next.
3. **Country / sector risk index** — a composite, explainable score (political, financial, regulatory, supply chain, environmental) built from the monitoring agents, with month-over-month movement so users see direction, not a static number.
4. **"Why this matters to you"** — every alert and report section is scored against the user's tracked projects and saved searches; the daily digest leads with the 3 items that changed their portfolio.
5. **Analyst chat over a report** — ask follow-ups against the report's own evidence set (extends `portfolio-chat`), so users interrogate findings instead of re-reading them.

## Phase 4 — Positioning and proof

- Reposition the marketing copy from "AI for infrastructure data" to outcome language: *know which projects matter before everyone else*, *see a stall six months early*.
- Publish a **methodology page**: how confidence is computed, how sources are verified, what the accuracy claims mean, and how prediction is backtested. Replace any unsubstantiated accuracy number with a measured one or remove it.
- Remove placeholder testimonials until real pilots exist; replace with a live "sample report" a visitor can generate against public data.
- Pricing narrative: a competitor charges €3.5k+ for one static PDF; we deliver unlimited, personalized, continuously updated reports for a subscription — plus per-report à-la-carte for non-subscribers.

## Suggested build order

1. Report Studio UI + open report-agent to entitled users + report quotas (Phase 1)
2. Branded PDF and citation appendix (Phase 2)
3. Free preview / paid unlock + scheduled reports (Phases 1–2)
4. Stall prediction + risk index scoring agents feeding reports and alerts (Phase 3)
5. Marketing/methodology rewrite (Phase 4)

## Technical notes

- `report-agent`: swap the staff gate for the AI entitlement gate; accept `scope` (region/country/sector/stage/tracked/saved_search id), `depth`, `window_days`; store them on `report_runs` in a new `params jsonb` column plus a `share`/`schedule` link.
- New table for scheduled reports (`report_schedules`: owner, params, cadence, next_run_at) driven by the existing cron + `process-email-queue` path.
- PDF: keep jsPDF client-side but move generation into a shared `src/lib/reports/pdf.ts` with layout primitives, chart rasterization, and the citation appendix; reuse `applyPdfWatermark`.
- Prediction scores live in new columns/tables written by scheduled agents (never computed ad hoc in the UI), so both reports and alerts read the same numbers.
- Plan limits must be mirrored in `src/lib/billing/limits.ts` and `supabase/functions/_shared/billing.ts`.
