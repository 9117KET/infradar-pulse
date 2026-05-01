# Phase 1 — Delta Report

Comparing current platform reality (FEATURES.md, FEATURE_CATALOG.md, PLATFORM_VISION, AGENT_ARCHITECTURE, USER_GUIDE, STRATEGIC_FEATURES, INDUSTRY_AND_PLATFORM_KNOWLEDGE, Pricing.tsx, CapabilitiesSection, PersonasSection, UseCaseSection, MEED research, ZERO_TO_ONE) against current `/go-to-market/*` copy.

---

## 1. What is NEW on the platform since GTM docs were written

Confirmed shipped in repo, absent or under-represented in GTM copy:

- **7 MDB ingest agents live** (not 5): World Bank, IFC, ADB, AfDB, EBRD, **AIIB, IADB**. GTM still says "5 MDBs".
- **10 named home-page modules** (CapabilitiesSection.tsx) including: Satellite verification, Delay prediction & early warning, Contractor intelligence, Procurement monitoring (20+ sources), AI market reports, Ask in plain English (NL search live).
- **Natural-Language Project Search** (`/dashboard/ask` + `nl-search` edge fn) — shipped. GTM treats as roadmap/research-agent.
- **AI Market Report Builder** (country/sector/tender/portfolio scoped) — shipped via `report-agent`.
- **Intelligence Summaries hub** (consolidates Digests + Reports).
- **Portfolio Chat** over tracked projects.
- **Tenders & Awards page** (live, alerts-backed).
- **Country Intelligence list + Country Detail dashboards**.
- **Project Comparison page** (`/dashboard/compare`).
- **Human-in-the-Loop Review Queue** with mandatory verification reason audit trail.
- **On-Demand Research Hub** (multi-agent pipeline triggered by NL queries, researcher+).
- **Engagement Hub** (leads, 4 engagement paths).
- **Project Watchlist / Portfolio** with notes.
- **Alert Rules CRUD** UI; Alert Intelligence classification + 30-day trend analytics.
- **Stakeholder & Contact Discovery** (categorised contacts, click-to-contact).
- **Geo Intelligence** dashboard (native Leaflet, region overlays).
- **Agent Monitoring** with pause/resume + per-agent task tracker.
- **Interactive Onboarding** — 6-step role-specific tour.
- **3-tier RBAC** (User / Researcher / Admin) via `user_roles` + `has_role`.
- **9 risk signal categories** explicitly tracked (Political, Financial, Regulatory, Supply Chain, Environmental, Construction, Stakeholder, Market, Security).
- **Lovable AI–first agent stack** (no required Perplexity/OpenAI/Firecrawl spend) — material credibility/cost story.
- **Pilot access counter** (first N signups get N days Pro, no card) — live on pricing page.
- **Founders Lifetime $1,499** — limited 100 seats, live on pricing.
- **Card-free 3-day trial** — live.
- **Paddle live checkout** with monthly/yearly toggle and 14-day refund window.

## 2. What has CHANGED (positioning, pricing, personas, modules)

- **Pricing & tiers** (Pricing.tsx is source of truth):
  - Free $0 — 2 AI queries/day, 3 insight reads, 1 export/day (≤25 rows).
  - **Starter $29/mo** ($278/yr ≈ $23.20/mo) — 20 AI queries/day, 50 insight reads, 20 exports (≤1,000 rows), AI digest emails, alert rules, **portfolio chat**, saved searches.
  - **Pro $199/mo** ($1,910/yr ≈ $159.20/mo) — 100 AI queries, 200 insights, 100 exports (≤10,000 rows), tearsheet PDFs, country/sector/tender/portfolio report PDFs, **delay risk scores, early-warning alerts, contractor intel, permit & regulatory tracker**.
  - **Enterprise** — custom; unlimited; API + webhooks; SSO/SAML; white-label; SLA.
  - **Founders Lifetime $1,499** one-time, capped at 100 seats.
  - GTM docs currently imply only Free / Starter / Pro / Enterprise without surfacing Starter price ($29) or Lifetime offer; YC doc has correct numbers but missing Lifetime & pilot mechanic.
  - GTM docs say "free for 12 months for early users" in LOI letters — **this no longer matches the live offer** (current mechanic = pilot N-day free Pro + card-free 3-day trial + 14-day refund). Needs alignment.
- **Persona list expanded** to 9 (PersonasSection): BD, EPC, infra consultants, DFI analysts, project finance, project managers, owners/developers, procurement & tender teams, infra organizations. GTM docs centre on 6.
- **Geographic scope** moved from "MENA + East Africa beachhead" framing toward **explicit global / 14 regions** (matches memory + hero copy). MENA/Africa is now a proof beachhead, not the headline.
- **Verified-intelligence** is now a positioning pillar: source URL required, unverified capped at 30% confidence, mandatory verification reason audit trail, human review queue. None of this appears in current LOI letters.
- **Cost moat narrative**: Lovable AI–first agent architecture means near-zero marginal LLM cost — strengthens the "100x cheaper, sustainable" angle vs incumbents.
- **Competitor framing on site is now anonymized categories** (regional publisher, global market research, energy/commodity research house, project finance terminal, MENA/Africa intel, tender aggregator) — GTM docs still name MEED / GlobalData / Wood Mackenzie directly. We can keep names internal but mirror the 6-category framing in public LOIs.

## 3. What is OBSOLETE in current GTM copy and must be removed/rewritten

- "**5 MDBs**" → replace with **7 MDB sources** (WB, IFC, ADB, AfDB, EBRD, AIIB, IADB).
- "**40+ AI agents**" — repo shows ~30 named edge functions in active families; safer claim is **30+ specialised agents across 7 families** (discovery/ingest, enrichment/verification, market & risk monitoring, reporting & user-facing AI). Flag as `[VERIFY count]` if precision matters.
- "**Free 12 months for early users**" in LOI letters → replace with current pilot mechanic (limited-seat free Pro window + card-free trial + 14-day refund).
- README "Last updated: April 2026" — refresh to **May 2026** and update "Immediate Actions" (EF London May 1 deadline is **today**; needs same-day or remove).
- "**Coverage of IsDB, AIIB, KfW on Q3 2026 roadmap**" in EPC LOI → AIIB is **already shipped**; rewrite to (KfW, IsDB, JICA, NDB) on roadmap.
- Standard Pitch in README: "GPT-4-class models" → 2026 framing should reference **GPT-5 / Gemini 3-class**.
- "**$2T in MDB-financed infrastructure**" — uncited; use **WB committed $117B in 2024** and **AfDB Mission 300 ($300B by 2030)** as defensible anchors.
- LOI letters all reference "AI research agent" generically — should now name the live surfaces: **Ask in plain English**, **Portfolio Chat**, **AI Market Report Builder**, **Intelligence Summaries**.
- LOI EPC template positions vs MEED only ($30k) — broaden to 6 incumbent categories already on Pricing page.
- YC application cites "40+ agents", "5 MDBs", "9 signal categories" — keep 9 signals (correct), update agent count + MDB count.
- Persona ordering in YC doc puts DFI #1; current commercial reality (and pricing-page persona block) puts **BD/EPC/consultants** as primary buyers because they have budget + faster purchase cycles. DFIs are best for **LOI/credibility**, not first revenue. Need to split LOI-target priority from revenue-target priority in the messaging.
- "Bechtel/Fluor/Vinci" name list in LOI should add named African/MENA priority targets already in LOI-TARGETS (L&T PT&D, CCC, Samsung C&T, POSCO, Bouygues).
- Application files all say "Pre-revenue. Seeking first 3 enterprise pilots." — confirm whether pilot-counter usage has changed this; if any pilots converted, update. `[VERIFY]`.

## 4. Contradictions between current product and current pitch

| # | Current pitch says | Product reality says | Action |
|---|---|---|---|
| 1 | "5 MDBs" | 7 MDB ingest agents shipped | Update to 7. |
| 2 | "40+ agents" | ~30 edge functions in agent families | Use "30+ specialised agents" or `[VERIFY]` exact count. |
| 3 | "Free for 12 months early access" | Pilot N-day Pro + 3-day card-free trial + 14-day refund window | Rewrite trial offer language. |
| 4 | "AI research agent" only | Ask, Portfolio Chat, Report Builder, Intelligence Summaries all live | Name the actual surfaces. |
| 5 | "MENA + East Africa beachhead" headline | Site/marketing now explicitly global, 14 regions | Reframe MENA/Africa as proof, not scope. |
| 6 | "GPT-4-class models" | 2026 era; site uses Lovable AI gateway with Gemini 3 / GPT-5 family | Update "why now". |
| 7 | "AIIB on roadmap" | AIIB ingest agent shipped | Move to shipped list. |
| 8 | DFI analysts as #1 buyer | Pricing tiers + Onboarding optimised for BD/EPC/consultants | Separate LOI-priority (DFI) from revenue-priority (BD/EPC/consultants). |
| 9 | "Pre-revenue" | Live Paddle checkout + lifetime sales possible | `[VERIFY]` whether any paid conversions exist before re-asserting "pre-revenue". |
| 10 | LOI letters omit verified-intelligence story | Verification queue, mandatory reasons, source URL required, 30% cap on unverified are central differentiators | Inject into all LOI templates. |

## 5. Items I will flag rather than invent

- Exact live agent count (`[VERIFY count from agent_config table]`).
- Whether any paid conversions / first revenue exist (`[VERIFY revenue]`).
- Number of projects, alerts and verified records currently in DB for a defensible "platform stats" line (`[VERIFY public-stats RPC numbers]`).
- Specific named conferences in May–Sep 2026 (cross-check `docs/TRACTION_MARKETING.md` conference calendar before locking).
- Any new/expired accelerator deadlines beyond the seven already tracked.

## 6. Proposed scope for Phases 2–4 (no writing yet)

If you approve this delta, Phase 2 will produce a single canonical `go-to-market/MESSAGING.md` aligned to the corrections above (7 MDBs, Lovable-AI cost moat, verified-intelligence pillar, named live surfaces, current pricing incl. Lifetime + pilot, 2026 "why now"). Phases 3 and 4 will then cascade those facts through the 5 LOI templates, 8 accelerator apps, LOI-TARGETS, README, and the four new files (PERSONA-PLAYBOOKS, PROOF-PACK, OBJECTION-HANDLING, OUTBOUND-SEQUENCES).

---

**Approve to proceed to Phase 2 (MESSAGING.md), or tell me which of these deltas to drop / soften / strengthen first.**
