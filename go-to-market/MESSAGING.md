# InfraRadarAI — Canonical Messaging

> Single source of truth for all outbound copy. Updated May 2026.
> Pulled from: `src/pages/Pricing.tsx`, `src/components/home/{Hero,Capabilities,Personas,UseCase}Section.tsx`, `docs/product/*`, `INDUSTRY_AND_PLATFORM_KNOWLEDGE.md`, live platform stats query (May 2026).
>
> Voice: confident, specific, numbers-forward. No "revolutionize / leverage / synergy".

---

## 1. One-liner (140 chars)

> InfraRadarAI replaces $5K–$200K/year infrastructure intelligence reports with verified, real-time AI agents from $29/month.

(139 chars.)

## 2. 25-word pitch

> InfraRadarAI is verified, real-time infrastructure intelligence: 30+ AI agents track 1,600+ projects across 7 MDBs and 140 countries — from $29/month.

## 3. 100-word pitch

> Infrastructure BD teams, EPC contractors, lenders and consultants spend $5K–$200K a year on quarterly PDFs from MEED, GlobalData and Wood Mackenzie. The underlying data is public.
> InfraRadarAI is the AI-native replacement: 30+ specialised agents continuously ingest 7 MDB pipelines (World Bank, IFC, ADB, AfDB, EBRD, AIIB, IADB) plus 20+ procurement portals, score every project for delay risk and confidence, and let users ask plain-English questions or generate report-quality briefs in seconds. Every record is source-linked; unverified projects are capped at 30% confidence and routed through a human review queue.
> Live platform, Paddle billing, plans from $29/mo.

## 4. 250-word pitch

> The infrastructure intelligence market is a $2–4B/year stack of static PDF reports. MEED Premium, GlobalData Construction, Wood Mackenzie, IJGlobal and regional MENA/Africa publishers each charge $3K–$200K/seat for quarterly analyst write-ups of public data. Their cost structure is human analysts; their interaction model is "wait for the next download".
>
> **InfraRadarAI is what that market looks like rebuilt AI-native in 2026.** A live platform with 1,671 verified infrastructure projects across 140 countries, 5,657 classified alerts, and $246B+ of pipeline value already indexed. 30+ specialised agents — running on the Lovable AI gateway with Gemini 3 / GPT-5 class models, no per-query Perplexity or Firecrawl bill — continuously ingest 7 MDBs, 20+ procurement portals, regulatory feeds, contractor filings and tender awards.
>
> Users get **10 product modules**: real-time monitoring, satellite verification, multi-source validation, geospatial intelligence, delay prediction & early warning, contractor intelligence, risk & anomaly signals across 9 categories, procurement monitoring (20+ sources), AI market reports, and Ask-in-plain-English natural-language search.
>
> Every claim is source-linked. Unverified records are capped at 30% confidence and held in a human-in-the-loop review queue with mandatory verification reasons. Three-tier RBAC, role-specific onboarding, full audit trail.
>
> **Pricing is the wedge.** Free tier with no credit card. Starter $29/mo, Pro $199/mo (delay scores, contractor intel, country/sector/tender PDF reports), Enterprise with API + SSO. Founders Lifetime $1,499 one-time, capped at 100 seats. Pilot access (limited free Pro window) live now.
>
> Live at infradarai.com.

---

## 5. Problem statement (3 framings)

### 5a. For investors

A $2–4B incumbent market (MEED, GlobalData, Wood Mackenzie, IJGlobal, regional publishers) sells quarterly PDF reports built by 50–100 analyst staff each, summarising data that is **already public** on World Bank, IFC, ADB, AfDB, EBRD, AIIB and IADB project pages. They cannot rebuild AI-native without destroying their own gross margin. The buyers — DFI staff, infrastructure PE, EPC BD teams, project finance desks — are sophisticated professionals who want to ask their own questions on demand and get verified answers, not wait for a quarterly download. We are the AI-native challenger at 1/100th the price.

### 5b. For customers

Your team currently pulls infrastructure intelligence from five places at once: a $30K MEED subscription, free MDB portals you scrape manually, a regional newsletter, a consultant retainer, and Slack threads from country leads. The intelligence is stale by the time it reaches a deal memo. When a tender moves from pipeline to RFP, you find out from a competitor announcement. When a contractor on your portfolio shows financial distress, you find out when work stops on site.

### 5c. Technical

The data is public, structured-enough, and updated daily, but spread across 7 MDB APIs, 20+ procurement portals, regulatory bulletins, court filings and corporate announcements with inconsistent schemas and no shared identifiers. Solving it well requires (a) durable ingest agents per source, (b) entity de-duplication across sources, (c) source-linked evidence storage with confidence scoring, (d) human-in-the-loop review, and (e) a query layer that translates natural-language questions into safe filtered queries. We have all five running on Supabase + Lovable AI.

---

## 6. Solution statement

InfraRadarAI is a verified-intelligence command center for global infrastructure. 30+ AI agents discover, enrich, score and monitor projects across 7 MDBs, 20+ procurement portals and 9 risk-signal categories. Every record carries a source URL and a confidence score; unverified records are capped at 30% confidence and routed through a human review queue with mandatory audit reasons. Users explore via filters, a Leaflet-based geospatial map, plain-English Ask, portfolio chat, country/sector/tender/portfolio AI report builders, and a tracked-project portfolio with custom alert rules. Free, Starter ($29/mo), Pro ($199/mo), Enterprise tiers; card-free trial; Founders Lifetime $1,499.

---

## 7. Why now (2026)

1. **Model economics flipped.** Gemini 3 and GPT-5 class models extract, score and summarise infrastructure documents at near-zero marginal cost. The unit economics that justified MEED's 50-analyst floor in 2015 don't survive 2026.
2. **Capital is moving.** World Bank committed $117B in FY2024. AfDB's Mission 300 targets $300B to electrify 300M Africans by 2030. JETP, IRA, EU Global Gateway and Belt-and-Road continuation all push trillions into infrastructure where intelligence demand has never been higher.
3. **Buyers expect self-service.** Bloomberg, Pitchbook, Crunchbase trained the buyer to expect live data + Ask-style query interfaces. PDF-quarterly is no longer a tolerable product, just a tolerated one.
4. **Public data + private workflow is the wedge.** All 7 MDBs we cover publish project documents publicly. The product is not the data — it's the verification, scoring, alerting, querying, reporting and team workflow on top of it.

---

## 8. Traction snapshot (May 2026)

> Live numbers from production database, May 2026:

- **1,671** infrastructure projects in database
- **140** countries covered
- **1,483** high-confidence (≥70) verified projects
- **5,657** classified alerts across 9 signal categories
- **$246B+** in indexed pipeline value
- **7** MDBs ingesting daily (World Bank, IFC, ADB, AfDB, EBRD, AIIB, IADB)
- **30+** specialised agents in production (`world-bank-ingest-agent`, `tender-award-monitor`, `risk-scorer`, `contact-finder`, `regulatory-monitor`, `supply-chain-monitor`, `stakeholder-intel`, `corporate-ma-monitor`, `esg-social-monitor`, `sentiment-analyzer`, `security-resilience`, `funding-tracker`, `nl-search`, `report-agent`, `digest-agent`, `portfolio-chat`, `generate-insight`, `executive-briefing`, plus discovery, enrichment, dedup and verification agents)
- **20+** procurement portals automated
- **9** risk-signal categories tracked: Political, Financial, Regulatory, Supply Chain, Environmental, Construction, Stakeholder, Market, Security
- **10** product modules live (monitoring, satellite verification, multi-source validation, geospatial intel, delay prediction, contractor intel, risk/anomaly signals, procurement monitoring, AI market reports, Ask in plain English)
- **Live billing** via Paddle: Free, Starter $29/mo, Pro $199/mo, Enterprise custom, Founders Lifetime $1,499 (cap 100 seats)
- **Card-free 3-day trial** + pilot-access counter (first N signups → Pro for N days, no card)
- **3-tier RBAC** (User / Researcher / Admin), interactive 6-step onboarding, mandatory verification audit trail
- **[VERIFY] paid conversions to date** — pull from `subscriptions` table before quoting publicly

---

## 9. Competitive wedge

| Incumbent category | Typical price | Cadence | Where InfraRadarAI wins |
|---|---|---|---|
| Regional intelligence publisher (e.g. MEED) | $5K–$15K/yr | Quarterly PDF | Real-time, 7 MDBs not 1, plain-English Ask, $29 entry |
| Global market research (e.g. GlobalData) | $10K–$50K/yr | Static reports | Live data + on-demand AI report builder vs static |
| Energy / commodity research (e.g. Wood Mackenzie) | $50K–$200K/yr | Annual research | 100x cheaper, infrastructure-specific, verified sources |
| Project finance terminal (e.g. IJGlobal) | $20K–$100K/yr | Financial feeds | Adds delay prediction, contractor intel, satellite verification |
| Regional MENA/Africa intel | $3K–$12K/yr | Weekly | Global 14-region coverage at lower price |
| Construction / tender aggregator | $4K–$20K/yr | Daily, unverified | Verified, confidence-scored, with audit trail |

**Three things incumbents structurally can't do:**

1. **Cost structure.** Their product is human analysts. Ours is Lovable AI agents on Supabase. Adding a new source costs us a weekend; them, a hire.
2. **Cross-MDB graph.** No single incumbent aggregates across all 7 MDBs we cover. WB-only watchers miss AfDB co-financing; ADB trackers miss IFC equity in the same country.
3. **Self-service AI surface.** Ask, Portfolio Chat, AI Report Builder, Intelligence Summaries — buyers want to query, not download.

---

## 10. Top 3 proof points

1. **Live platform with real numbers** — 1,671 projects / 140 countries / 5,657 alerts / $246B pipeline indexed today, queryable at infradarai.com.
2. **Verified-intelligence rule** — every project carries a source URL; unverified records capped at 30% confidence; human review queue with mandatory verification reason; full audit trail. Solves the "AI hallucinates" objection at the architecture level.
3. **Live commerce, not a deck** — Paddle checkout, monthly + yearly toggle, 14-day refund window, card-free trial, Founders Lifetime offer with public seat counter.

---

## 11. Top 5 objections + crisp rebuttals

| # | Objection | Rebuttal | Proof artifact |
|---|---|---|---|
| 1 | "How is this different from MEED / GlobalData?" | They sell a quarterly PDF written by humans. We sell a live platform: 7 MDBs aggregated, plain-English Ask, AI report builder, alerts, satellite verification, contractor intel — at 1/100th the price. | Send pricing page + 5-min demo video |
| 2 | "Can we trust AI-generated infrastructure data?" | Every record has a source URL. Unverified projects are capped at 30% confidence by design. A researcher must approve and supply a written verification reason before a record is trusted. Three-tier RBAC controls who can change what. | Send Verified-Intelligence page + audit trail screenshot |
| 3 | "Our procurement / IT can't approve another SaaS." | Free tier requires no card and no procurement. Individual analyst can run a $29 Starter on a personal card. Enterprise contract with SSO/SAML, API, white-label and SLA exists when you're ready. | Free signup link + Enterprise one-pager |
| 4 | "We already have a $30K MEED subscription." | Run InfraRadarAI Pro for one quarter ($600). If it doesn't surface 5 tenders MEED missed, keep the MEED renewal. We'll show you the gap analysis live. | Side-by-side gap-analysis demo |
| 5 | "Is the data really real-time?" | Ingest agents run daily across 7 MDBs and 20+ procurement portals. 5,657 classified alerts in our system today; new MDB awards typically appear within 24h of public posting. Compare any tender on the platform vs the source URL — same timestamp. | Live platform + alert feed screenshot |

---

## 12. Anchors and language to reuse verbatim

- "Verified infrastructure intelligence for high-stakes decisions" (hero)
- "Replaces $5K–$200K/year reports with real-time AI agents from $29/month"
- "7 MDBs · 14 regions · 30+ agents · 9 risk-signal categories"
- "Source-linked. Confidence-scored. Human-reviewed."
- "Ask in plain English"
- "From quarterly PDF to live workflow"

## 13. Language to never use

- "Revolutionize", "leverage", "synergy", "next-generation", "cutting-edge"
- "5 MDBs" (it's 7)
- "40+ agents" (use 30+)
- "Free for 12 months" (it's pilot-access + 3-day trial + 14-day refund)
- "GPT-4-class" (it's Gemini 3 / GPT-5 era)
- "MENA/East Africa beachhead" as the headline (it's global / 14 regions; MENA-Africa is a proof region)
