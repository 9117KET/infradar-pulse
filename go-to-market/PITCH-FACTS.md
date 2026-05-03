# InfraRadar Pulse - Canonical Pitch Facts

> Single source of truth for all GTM documents. Copy from here rather than inventing numbers.
> Last updated: May 2026.

---

## One-Liners

**140 chars:**
InfraRadar replaces $200k/year infrastructure intelligence reports with real-time AI agents at $199/month - 7 MDBs, 14 regions, 50+ agents.

**50 chars:**
AI infrastructure intelligence, 100x cheaper

---

## The Numbers

| Fact | Value |
|---|---|
| MDB sources | 7 (World Bank, IFC, ADB, AfDB, EBRD, AIIB, IDB) |
| AI agents / Edge Functions | 50+ (56 deployed) |
| Dashboard pages | 30 |
| Global regions covered | 14 |
| Infrastructure sectors | 14 |
| Pre-tender pipeline visibility | 6-18 months before RFP |

---

## Problem Statement

Infrastructure investors, EPC contractors, and project finance teams need real-time intelligence on trillions of dollars in globally planned and active infrastructure projects. Today, they pay $3,000 to $200,000 per year to incumbents like MEED, GlobalData, and Wood Mackenzie for quarterly PDF reports written by human analysts. These reports are slow, static, generic, and priced out of reach for most market participants.

The underlying data is entirely public - published by the World Bank, IFC, ADB, AfDB, EBRD, AIIB, and IDB. Incumbents hire humans to read it. We deploy AI agents.

---

## Solution

InfraRadar Pulse is an AI-native intelligence platform. We aggregate real-time project data from 7 multilateral development banks, run 50+ AI agents to score, alert on, and research each project, and deliver personalized intelligence via a self-service dashboard at $199/month.

**AI infrastructure:** The platform runs on the Lovable AI Gateway (Gemini-based). No separate OpenAI, Perplexity, or Firecrawl API keys are required - all AI inference is handled through a single managed gateway at near-zero marginal cost per query.

**Platform features (30 shipped dashboard pages):**

*Intelligence & Research:*
- On-demand AI research agent (natural language queries across the full project database)
- Real-time alerting across 9 signal categories (Political, Financial, Regulatory, Supply Chain, Environmental, Construction, Stakeholder, Market, Security)
- AI-generated intelligence digests every 4 hours
- Intelligence summaries per region and sector
- Evidence verification with confidence scoring

*Monitoring & Risk:*
- Risk and anomaly signals
- Real-time project monitoring
- Stakeholder intelligence
- Agent health monitoring (50+ agents with uptime tracking)

*Project Intelligence:*
- 7 MDB data sources updated daily
- Side-by-side project comparison
- Country-level intelligence with geospatial heat maps
- Tender intelligence (pipeline + calendar, 6-18 months pre-RFP)
- Pre-tender signal detection
- Cross-MDB co-financing graph

*Portfolio & BD:*
- Portfolio tracking with custom alert rules
- Portfolio Chat (AI conversation over your tracked projects)
- BD Pipeline dashboard
- Datasets and data export

*Reporting:*
- AI-generated reports
- Analytics and usage reports
- Review queue (researcher workflow)

---

## Traction

Platform is live and fully deployed. Not a mockup or prototype.

Shipped and running:
- 7 MDB data integrations (World Bank, IFC, ADB, AfDB, EBRD, AIIB, IDB) ingesting daily
- 50+ AI agents operational (ingestion, scoring, alerting, reporting, research)
- 30 dashboard pages across intelligence, monitoring, portfolio, and reporting
- Payments live via Paddle (6 subscription tiers)
- Role-based access control (User / Researcher / Admin)
- Natural language search, evidence verification, geospatial maps
- Tender intelligence with pre-tender pipeline signals
- Portfolio Chat, Stakeholder Intelligence, Risk & Anomaly Signals all shipped

Stage: Pre-revenue. Seeking first enterprise pilot customers. The gap is go-to-market, not product.

Tech stack: React/TypeScript + Supabase + Lovable AI Gateway (Gemini) + Paddle + Vercel

---

## Pricing

| Tier | Monthly | Annual | Notes |
|---|---|---|---|
| Free | $0 | - | 2 AI calls/day, 1 export/day |
| Trial | $0 | - | 3-day no-card trial, 5 AI calls/day |
| Starter | $29/mo | $278/yr (20% off) | 20 AI calls/day, 20 exports/day |
| Pro | $199/mo | $1,910/yr (20% off) | 100 AI calls/day, full platform |
| Enterprise | Custom | Custom | Unlimited, API access, white-label |
| Lifetime | $1,499 one-time | - | Limited to 100 seats |

---

## Market Size

- MEED alone: $50M+/year at $5-15k/seat
- GlobalData infrastructure segment: $200M+/year
- Total infrastructure data and intelligence market: $2-4B globally
- World Bank committed $117B in 2024 alone
- AfDB Mission 300: $300B to electrify 300M Africans by 2030

InfraRadar enters at the mass-market segment currently unserved by incumbents: teams who need intelligence but cannot justify $50k+/year.

---

## Competition

| Incumbent | Annual price | InfraRadar advantage |
|---|---|---|
| MEED | $5-15k/yr | 100x cheaper, real-time vs quarterly, AI-native |
| GlobalData | $10-50k/yr | 50x cheaper, 7-MDB integration they lack |
| Wood Mackenzie | $50-200k/yr | 1000x cheaper, project-level vs market-level |
| Refinitiv | $20-100k/yr | Operational intelligence vs financial instruments |

---

## Why Now

1. **AI cost collapse.** Gemini and GPT-4-class models make real-time document extraction, scoring, and alerting tractable at near-zero marginal cost. Incumbents cannot rebuild as AI-native without destroying their own analyst-driven revenue model.
2. **Infrastructure investment peak.** World Bank committed $117B in 2024. AfDB's Mission 300 targets $300B in African infrastructure. MDB pipeline intelligence has never been more valuable.
3. **Data is already public.** All 7 MDB project databases are open access. The barrier is structuring and monitoring them continuously - exactly what AI agents do.

---

## Moats Being Built

1. Proprietary delay prediction model trained on historical MDB project outcomes
2. Cross-MDB co-financing graph (no incumbent aggregates across all 7 MDBs)
3. Satellite construction verification layer (ESA Sentinel-2 + commercial)
4. Verified professional network (infrastructure practitioners contributing ground-truth signals)

---

## Customer Segments (priority order)

1. **DFI Analysts** - Task Team Leaders at World Bank, IFC, ADB, AfDB, EBRD, AIIB, IDB. Publicly named on every project document - directly reachable. Currently track portfolios manually across 7 separate institution portals.
2. **Project Finance Directors** - Infrastructure finance desks at Standard Bank, Absa, SocGen, StanChart, Citi, HSBC. Need early warning signals for non-performing loans and deal sourcing leads.
3. **EPC BD Teams** - Business development at Bechtel, Fluor, Vinci, Bouygues, L&T, CCC. Track tender pipelines; missing a pre-tender signal means losing 6-18 months of positioning. Currently pay $30k+/year for this intelligence.
4. **Infrastructure PE Funds** - Deal sourcing at Brookfield, Macquarie, KKR, Actis, I Squared, AIIM. Platform surfaces bankable deals in MENA and East Africa before competitors.
5. **Government Ministries / SWFs** - Cross-sector investment monitoring, attracting MDB co-financing capital.
6. **Strategy Consultants** - McKinsey GII, Arup, PwC, KPMG teams aggregating MDB project data for client advisory engagements.

---

## Beachhead Market: MENA + East Africa

- Fastest-growing infrastructure spend globally
- World Bank and AfDB most active in these regions
- Least well-served by existing intelligence tools
- Named, reachable DFI contacts on every public project document

---

## Conferences (direct enterprise sales)

- Infrastructure Investor Forum - London, September
- SuperReturn Africa - Cape Town, December
- MEED MENA Construction Summit - Dubai, November
