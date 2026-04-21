# InfraRadar Pulse - Competitive Strategy and Feature Roadmap

> Internal strategy document. This file tracks our differentiation thesis, competitive analysis, feature roadmap, and implementation status. Not for external distribution.

---

## Implementation Status

### Completed - April 2026

**Website and marketing:**
- [x] Pricing page: updated to 4 tiers (Free, Starter $29/mo, Pro $199/mo, Enterprise custom) with competitor comparison table
- [x] CapabilitiesSection: added Delay Prediction, Contractor Intelligence, Procurement Monitoring (20+ sources) as new modules
- [x] PersonasSection: added DFI Analysts and EPC Contractors - expanded from 4 to 6 personas
- [x] ProblemSection: added incumbent cost stat ($200k/yr), "what incumbents get wrong" breakdown, 4th stat card
- [x] UseCaseSection: two full case studies (DFI portfolio fund + EPC contractor) with before/after/impact flows
- [x] HeroSection: tagline updated to explicitly name target buyers (DFI analysts, project finance teams, EPC contractors)

**Platform (already live before this session):**
- [x] AI research agent (on-demand multi-step research)
- [x] Real-time alerting (9 signal categories)
- [x] Multi-source ingestion (World Bank, IFC, ADB, AfDB, EBRD)
- [x] Confidence scoring per project
- [x] Portfolio tracking and alert rules
- [x] Stakeholder intelligence extraction
- [x] Tender monitoring and calendar
- [x] Evidence verification (Satellite, Filing, News, Registry, Partner types)
- [x] Geospatial heat maps and globe
- [x] Side-by-side project comparison (up to 5)
- [x] Intelligence summaries and executive digests
- [x] Role-based access control (user / researcher / admin)
- [x] Stripe billing integration (Free, Starter, Pro, Enterprise, Lifetime)

---

### To Implement - Tier 1 (Next 90 Days)

- [ ] Contractor Intelligence Database (new page, DB tables, ingest agent)
- [ ] Procurement Portal Aggregation - 10 new sources beyond MDBs (IsDB, AIIB, KfW, JICA, NDB, Etimad, PPIP, UNGM, etc.)
- [ ] Early Warning Score Dashboard (composite health score per project)
- [ ] Regulatory and Permit Tracker (project_permits table, alerts on denial/overdue)

---

### To Implement - Tier 2 (3-9 Months)

- [ ] API-First Enterprise Layer (REST API keys, webhooks, SDK)
- [ ] Satellite Construction Verification (ESA Sentinel-2 free integration + Claude Vision analysis)
- [ ] Verified Professional Network (credentialing, contribution system, reputation scoring)
- [ ] Delay Prediction Model v1 (rule-based composite score, ML upgrade when 500+ completed projects)

---

### To Implement - Tier 3 (9-18 Months)

- [ ] InfraRadar Global Infrastructure Confidence Index (GICI) - monthly public benchmark
- [ ] Community Intelligence Portal (anonymous + named signal submission)
- [ ] Document Intelligence Layer (AI extraction from EIAs, PADs, feasibility studies)
- [ ] Contractor Financial Health Monitor (top 200 EPC firms, financial distress signals)

---

## 1. The Core Insight

Infrastructure intelligence is currently solved by expensive, slow, human-analyst-driven PDF report companies. The buyers - DFI analysts, project finance teams, EPC contractors, private equity infrastructure funds - are some of the most sophisticated professionals in the world, yet they use tools from 2005.

They will pay for real-time, AI-native, self-service intelligence at a fraction of current cost. The gap between what they have and what is possible is enormous, and incumbents cannot close it without destroying their own margins.

---

## 2. Competitive Landscape: What Incumbents Get Wrong

| Competitor | What They Sell | Typical Price | Fatal Flaw |
|---|---|---|---|
| MEED (Middle East Economic Digest) | MENA project news + PDF reports | $5k-$15k/yr | Quarterly updates, no AI, journalist-led not data-led |
| GlobalData Infrastructure | Market research reports | $10k-$50k/yr | Static PDFs, no real-time signals, no portfolio personalization |
| Wood Mackenzie | Energy/commodity intelligence | $50k-$200k/yr | Financial lens only, no operational project tracking |
| Refinitiv/LSEG | Project finance data | $20k-$100k/yr | Financial instruments, not project-level operational intelligence |
| Infrastructure Journal | News aggregation | $3k-$8k/yr | No AI, no alerting, no confidence scoring, pure editorial |
| Oxford Business Group | Country economic reports | $2k-$5k/yr | Annual cadence, no real-time, no project-level granularity |
| World Bank PPPIRC (free) | PPP reference database | Free | Manual browsing, no enrichment, no alerts, no AI |

**What every incumbent does wrong:**

1. Sell annual PDF reports - zero personalization, zero real-time updates
2. Human analysts are the bottleneck - research takes days or weeks
3. No confidence scoring - you cannot know how reliable the data is
4. Sector-siloed - energy OR transport OR water, never integrated
5. No early warning signals - you learn about a delay after it happens
6. Terrible UX - clunky portals, Excel exports, literally calling their offices
7. Pricing excludes the mid-market - only major banks and governments can afford them
8. No stakeholder intelligence - "who is actually doing this project" is unknowable
9. No geospatial visualization - no map, no heat maps, no cluster analysis

---

## 3. What InfraRadar Already Does That Is 10x Better

| Dimension | Incumbents | InfraRadar Now |
|---|---|---|
| Price | $3k-$200k/yr | $0-$29/mo to start |
| Research speed | Days (call an analyst) | Seconds (AI on-demand) |
| Alert latency | Quarterly/annual | Real-time (9 signal categories) |
| Coverage | One region or sector | 14 regions x 14 sectors simultaneously |
| UX | Clunky portals, PDFs | Modern self-service SaaS |
| Personalization | None | Portfolio tracking, saved searches, alert rules |
| Confidence scoring | None | Per-project confidence % |
| Geospatial | None | Heat maps, interactive globe |
| AI research | None | On-demand multi-step research agent |
| Verification | None | Evidence types (Satellite, Filing, News, Registry, Partner) |
| Stakeholder intel | None | Contact extraction and organization tracking |
| Tender monitoring | None | Tender type categorization and calendar |
| Pipeline view | None | Kanban by project stage |
| Side-by-side compare | None | Up to 5 projects simultaneously |

The price advantage alone (100x-1000x cheaper) combined with AI-native research creates an opening that incumbents cannot close without destroying their business models.

---

## 4. Four Defensive Advantages to Build

### 4.1 Proprietary Technology (10x Better in New Dimensions)

**Already achieved:** AI research agent, real-time alerting, multi-source aggregation, confidence scoring.

**Gaps - what nobody has done yet:**

**A. Proprietary Delay Prediction Engine** (the biggest gap in the sector)
- Incumbents publish delay reports AFTER delays happen
- We can predict them 6-9 months ahead by training on:
  - Tender re-issuance frequency patterns
  - Contractor financial health signals
  - Political calendar proximity (elections within 18 months correlate with renegotiations)
  - Currency depreciation > 15% correlates with financing restructuring
  - Similar historical project failure signatures
- This becomes our flagship proprietary intelligence product, uncopiable by PDF report companies

**B. Document Intelligence (AI reading what nobody reads)**
- Every major project has public Environmental Impact Assessments, feasibility studies, tender documents - thousands of pages of unread data
- AI that reads ALL documents, extracts structured intelligence, flags contradictions
- "Document drift detection": when official press releases contradict filed EIA documents
- This creates a verifiable signal layer incumbents cannot manufacture

**C. Satellite-Verified Construction Progress**
- Evidence type already exists in our schema - we need actual satellite data integration
- Integration with ESA Sentinel-2 (free), Planet Labs, or Maxar
- Quarterly construction progress photos for projects in Construction stage
- Ground truth verification that no analyst can fake and no competitor currently offers

### 4.2 Network Effects

**Currently:** Zero - platform works identically for 10 users or 10,000 users.

**Plan - Community Intelligence Layer:**

**A. Verified Professional Contributions**
- Industry professionals (engineers, DFI staff, government officials, contractors) earn "Verified Expert" status
- They can submit project updates, flag errors, confirm milestones
- Incentive: reputation score, visibility, early access to features
- Result: more users -> more ground-truth signals -> better platform -> more users

**B. Anonymous Signal Submission**
- Secure portal: anonymous tips about project status
- Tips go to researcher review queue, verified before publishing
- Sources: disgruntled contractors, local journalists, affected communities
- This is intelligence no incumbent has

**C. Consortium and Relationship Mapping**
- Users who are contractors submit their own bid history (anonymized at aggregate)
- Platform learns which firms win in which regions/sectors
- Builds the world's most accurate contractor performance database
- More participants -> richer contractor intelligence -> more valuable for all

### 4.3 Economies of Scale

**Already present:** AI research cost is near-zero per additional query. Database scales linearly.

**Compounding advantages to build:**
- Historical project archive: every year of data makes the delay prediction model more accurate
- More MDB sources: add AIIB, IsDB, NDB, KfW, JICA - each new source costs almost nothing to add but increases coverage
- Regional expansion: each new region reuses the same infrastructure, pure margin improvement

### 4.4 Brand Authority

**What we own:** The phrase "infrastructure intelligence platform" should become synonymous with InfraRadar.

**How:**
- Publish free intelligence reports (quarterly regional briefings) seeded from our data
- Be the cited source in academic papers and DFI reports
- Run the "InfraRadar Global Infrastructure Confidence Index" (GICI) - a public monthly benchmark
- Publish the "Annual Infrastructure Delay Report" (built from our data, distributed freely)
- This is how Bloomberg became Bloomberg - they gave away the terminal's intellectual output as journalism

---

## 5. Geographic Expansion Strategy

**Start small, own it, then expand.**

**Phase 1 - Own MENA (0-12 months):**
- MENA has the highest average project value ($4.2B), fastest growth
- We already have MENA data from World Bank, IFC, AfDB, EBRD sources
- Target: Saudi Vision 2030 vendors, UAE-based DFIs, infrastructure consultancies in Dubai
- Price for MENA Enterprise: $500-2000/mo per seat (vs $15k/yr for MEED)

**Phase 2 - East Africa (12-24 months):**
- $890M average project value, +31% YoY growth, underserved by intelligence tools
- DFI donors (World Bank, AfDB) are the primary audience
- Bundle with MENA as "InfraRadar Africa+MENA"

**Phase 3 - South/Southeast Asia + Global (24+ months):**
- ADB data already ingested for Southeast/South Asia
- By then: network effects compound, contractor database is years deep, delay model is accurate

---

## 6. Feature Roadmap with Implementation Guides

### Tier 1: Core Moat (Next 90 Days)

#### 6.1 Contractor Intelligence Database

**What it is:** Track which contractors and consultants win bids globally, with financial health monitoring.

**Why it creates a durable advantage:** This data does not exist anywhere in structured form. Building it is slow and requires years of data accumulation - the longer we run, the harder it is to replicate.

**Features:**
- Which contractors are active in which regions/sectors
- Win rate analytics: which firms win in which markets
- Consortium mapping: who partners with whom
- Financial distress alerts: when a contractor on your portfolio shows stress
- Cross-reference: all projects associated with a given contractor become "At Risk" when contractor shows distress

**Implementation plan:**
```
Database:
- New migration: contractors table
  (id, name, country, type: EPC/Consultant/Government, website, financial_data JSONB, health_score INTEGER)
- New migration: contractor_project_assignments
  (contractor_id, project_id, role: Lead/Consortium/Subcontractor, source)
- New migration: contractor_financial_signals
  (contractor_id, signal_type, severity, description, source_url, created_at)

Edge Functions:
- supabase/functions/contractor-intel-agent/index.ts
  - Scrapes contractor profiles from project filings
  - Extracts from World Bank, ADB, EBRD vendor lists
  - Financial health signals from public company filings

Frontend:
- src/pages/dashboard/Contractors.tsx (new page)
- src/components/dashboard/ContractorCard.tsx
- Route: /dashboard/contractors
- Add to DashboardLayout sidebar nav
```

**Tools and APIs needed:**
- Firecrawl: scrape EBRD, ADB, World Bank vendor portals for contractor mentions
- Perplexity: search for contractor financial news
- OpenCorporates API (free tier): company data, registration status
- SEC EDGAR API (free): US-listed contractor filings
- Bloomberg/Refinitiv: for public company financials (enterprise tier only)

#### 6.2 Procurement Portal Aggregation (Beyond MDBs)

**What it is:** Ingest tender notices from national procurement portals, not just multilateral development banks.

**Why it creates a durable advantage:** More unique sources = more unique intelligence = stronger differentiation. We currently have 5 MDB sources; adding 10+ national portals doubles our pipeline coverage.

**New sources to add:**

| Source | Coverage | Access Method |
|---|---|---|
| Saudi Arabia Etimad (etimad.sa) | Saudi Vision 2030 tenders | Firecrawl scrape |
| Kenya PPIP (ppip.go.ke) | East African tenders | Firecrawl scrape |
| Nigeria BPPIS | West African tenders | Firecrawl scrape |
| Egypt GAFI (gafi.gov.eg) | Egyptian infrastructure | Firecrawl scrape |
| UNGM (ungm.org) | UN procurement notices | API (free registration) |
| IsDB (isdb.org) | Islamic world infrastructure | Firecrawl scrape |
| AIIB (aiib.org) | Asia Pacific tenders | Firecrawl scrape |
| KfW (kfw-entwicklungsbank.de) | German development bank | Firecrawl scrape |
| JICA (jica.go.jp) | Japanese development projects | Firecrawl scrape |
| NDB (ndb.int) | BRICS development bank | Firecrawl scrape |

**Implementation plan:**
```
Edge Functions (one agent per source):
- supabase/functions/isdb-ingest-agent/index.ts
- supabase/functions/aiib-ingest-agent/index.ts
- supabase/functions/kfw-ingest-agent/index.ts
- supabase/functions/jica-ingest-agent/index.ts
- supabase/functions/ungm-ingest-agent/index.ts

Pattern: Follow existing ingest agent pattern in supabase/functions/_shared/
Register each in: src/lib/api/agents.ts (agentApi.run*Ingest())
Add to agent_config table: new migration for each new agent type
Add trigger buttons in: src/pages/dashboard/AgentMonitoring.tsx
```

#### 6.3 Early Warning Score Dashboard

**What it is:** A single composite "Project Health Score" (1-100) per project, synthesizing all risk signals.

**Why it matters:** This is the first thing our target buyers (project finance teams, DFI analysts) want to see. A single number they can sort and filter on, with trend direction.

**Score factors:**
- Contractor health (weight: 25%)
- Political risk proximity - elections, leadership changes (weight: 20%)
- Permit/regulatory status (weight: 20%)
- Funding gap signals (weight: 15%)
- Community opposition / media sentiment (weight: 10%)
- Alert frequency trend (weight: 10%)

**Implementation plan:**
```
Database:
- Add columns to projects: health_score INTEGER, health_trend TEXT (rising/stable/falling), health_computed_at TIMESTAMPTZ
- New migration for project_health_history table (project_id, score, factors JSONB, computed_at)

Edge Functions:
- Extend supabase/functions/risk-scorer/index.ts with composite health score calculation
- Add health_score update to all ingest agents after project upsert

Frontend:
- src/components/dashboard/EarlyWarningScore.tsx - composite score display with trend
- Add to ProjectDetail page (src/pages/dashboard/ProjectDetail.tsx)
- Add sortable column to Projects table (src/pages/dashboard/Projects.tsx)
- Alert threshold: project_health_score drops below 40 -> critical alert
```

**Key files to modify:**
- `supabase/functions/risk-scorer/index.ts` - add composite score calculation
- `src/hooks/useProjects.ts` - expose health_score field
- `src/pages/dashboard/Projects.tsx` - add health score column and sorting

#### 6.4 Regulatory and Permit Tracker

**What it is:** Map each project to its required regulatory approvals and permits; track status and alert on failures.

**Why permit denial is critical:** Permit denial is the #1 leading indicator of project delay or cancellation, 6-9 months before any announcement. Nobody currently tracks this systematically.

**Implementation plan:**
```
Database:
- New migration: project_permits table
  (id, project_id, permit_type TEXT, status: pending|granted|denied|overdue,
   authority TEXT, submitted_date DATE, expected_date DATE, granted_date DATE,
   source_url TEXT, notes TEXT, created_at, updated_at)

Edge Functions:
- supabase/functions/regulatory-monitor/index.ts (already exists - extend it)
- Add permit extraction from EIA documents and project filings
- Alert generation when: status = denied OR expected_date < now() AND status = pending

Frontend:
- src/components/dashboard/PermitTracker.tsx - new component for project detail
- Add to ProjectDetail page below evidence section
- Permit summary badge on project cards in list view
```

---

### Tier 2: Network Effects and Data Moat (3-9 Months)

#### 6.5 API-First Enterprise Layer

**What it is:** Full programmatic access to InfraRadar data for enterprise customers.

**Why it creates a durable advantage:** This turns InfraRadar into infrastructure for infrastructure intelligence - harder to replace than a dashboard once embedded in client workflows.

**Features:**
- REST API with API key authentication
- Webhooks: push alerts into client Slack, Teams, email, CRM systems
- GraphQL endpoint for flexible queries
- Rate limits by plan tier
- White-label intelligence reports for consulting firms
- SDK packages: Python, JavaScript

**Tools and APIs needed:**
- Supabase built-in REST API (PostgREST) - already available, needs proper key management
- Supabase Realtime webhooks for push notifications
- No new edge functions needed for basic REST access

**Implementation plan:**
```
Database:
- New migration: api_keys table (id, user_id, key_hash, name, plan_tier, last_used, created_at)
- New migration: api_usage_log (api_key_id, endpoint, count, date)
- New migration: webhooks table (user_id, url, events[], secret, active)

Edge Functions:
- supabase/functions/api-key-manager/index.ts - generate, revoke API keys
- supabase/functions/webhook-dispatcher/index.ts - triggered on alerts, dispatches to registered URLs

Frontend:
- src/pages/dashboard/Settings.tsx - add API Keys tab with key generation UI
- src/pages/dashboard/Webhooks.tsx - new page for webhook management
- New public docs page: /docs/api (static page explaining API usage)
```

**Pricing gating:** API access is Pro ($199/mo) and Enterprise only.

#### 6.6 Satellite Construction Verification Integration

**What it is:** Real satellite imagery integration for projects in the Construction stage.

**The opportunity:** Our evidence schema already has a "Satellite" type - we just need to wire it to real data. This is the one signal no incumbent can manufacture.

**Tools and APIs:**

| Provider | Cost | How to Use |
|---|---|---|
| ESA Copernicus/Sentinel-2 | Free | REST API at dataspace.copernicus.eu; 10m resolution, 5-day revisit |
| Planet Labs | $500+/mo | Commercial API; 3m resolution, daily revisit |
| Maxar | Enterprise pricing | Highest resolution, historical archive |
| Google Earth Engine | Free (research) | JavaScript/Python API; batch processing |

**Start with Sentinel-2 (free) for MVP:**
```
Tools:
- Direct REST API calls via fetch() from Deno edge function
- Register at dataspace.copernicus.eu for free API credentials

Edge Function:
- supabase/functions/satellite-verification-agent/index.ts
  1. Query all projects where stage = 'Construction' and lat/lng are populated
  2. For each: query Sentinel-2 API for latest imagery (last 30 days)
  3. Send image to Claude Vision API for analysis
  4. Extract: estimated construction activity level (0-100), change from previous, visible features
  5. Create evidence_source record with type='Satellite', verified=true
  6. Alert if no construction activity detected in 90+ days (potential stall)

Frontend:
- Add satellite imagery thumbnail to project evidence section
- Show "Last satellite verification: [date]" badge on project cards
- Timeline chart: satellite activity scores over time
```

**Claude Vision prompt for satellite analysis:**
```
Analyze this satellite image of an infrastructure construction site.
Report: (1) estimated % of site with active construction activity,
(2) presence of heavy equipment (Y/N), (3) visible structural changes
since last month, (4) earthwork area in approximate hectares,
(5) overall activity level: Active/Moderate/Stalled/No Activity.
```

#### 6.7 Verified Professional Network

**What it is:** A credentialing system that lets industry professionals contribute verified intelligence.

**Why this creates network effects:** More experts -> more accurate data -> more valuable platform -> more experts sign up.

**Implementation plan:**
```
Database:
- Extend profiles table: expert_status TEXT (none|pending|verified), expert_organization TEXT,
  expert_domain TEXT[], verified_at TIMESTAMPTZ
- New migration: expert_contributions
  (id, user_id, project_id, contribution_type, content,
   status: pending|approved|rejected, reviewed_by, created_at)
- New migration: expert_reputation (user_id, total_contributions, approved_contributions, reputation_score)

Frontend:
- src/pages/dashboard/Settings.tsx - add "Expert Profile" tab with credential submission
- src/pages/dashboard/ProjectDetail.tsx - "Submit Update" button for verified experts
- src/pages/dashboard/Review.tsx - extend existing review queue to show expert contributions

Edge Functions:
- Extend existing researcher review queue to handle expert contributions
- Notification to expert when contribution is approved/rejected
```

**Invitation-only initially:** Researcher/admin role can invite experts via admin panel.

#### 6.8 Delay Prediction Model (v1)

**What it is:** A model that predicts the probability and magnitude of project delays 6-9 months in advance.

**Why this is the single most valuable feature in the sector:** Incumbents publish delay reports AFTER delays happen. Accurate advance prediction is worth tens of millions to project finance teams and DFI analysts.

**Data we need (already mostly collected):**
- Project stage history (when did it move from Tender to Construction?)
- Alert history by category (how many political/financial alerts in last 90 days?)
- Contractor assignments + contractor health scores
- Country risk scores + political calendar proximity
- Permit status (from Tier 1 above)
- Value vs. regional average (overpriced projects delay more often)

**Implementation approach:**

Option A (Fast - Rule-based scoring): No ML, use weighted scoring across factors. Build now.
Option B (Later - ML model): Train on historical outcome data once we have 500+ completed projects.

**Start with Option A:**
```
Score calculation (0-100, higher = higher delay risk):
+ Political proximity: elections within 12 months in country -> +20
+ Contractor health: if any contractor has health_score < 40 -> +25
+ Permit risk: if any permit is overdue or denied -> +20
+ Alert density: >3 critical alerts in 30 days -> +15
+ Funding gap: value > $1B and financing stage not confirmed -> +10
+ Historical pattern: sector x region has >60% delay rate historically -> +10

Edge Function: supabase/functions/risk-scorer/index.ts (extend existing)
Add delay_risk_score and delay_risk_factors JSONB to projects table
Display on project detail: "Delay risk: 67% (High) - driven by contractor health, permit delays"
```

---

### Tier 3: Market Authority (9-18 Months)

#### 6.9 InfraRadar Global Infrastructure Confidence Index (GICI)

**What it is:** A monthly public index - weighted confidence-adjusted view of global infrastructure pipeline value by region, sector, and stage.

**How to build it:**
- Aggregate all projects by region/sector with confidence-weighted value totals
- Compare month-over-month: "MENA pipeline confidence +3.2 points MoM"
- Publish as free PDF report monthly
- Press release distribution to infrastructure media
- "GICI" becomes a citable benchmark

**Implementation:**
```
Edge Function: supabase/functions/gici-calculator/index.ts
- Run monthly via pg_cron
- Output: JSONB report with region/sector breakdown
- Store in: report_runs table with report_type = 'gici_monthly'
- Publish: trigger insight generation for the public insights feed

Frontend: src/pages/Insights.tsx - feature GICI reports prominently
Marketing: /insights page shows latest GICI report as lead content
```

#### 6.10 Community Intelligence Portal

**What it is:** Anonymous and named signal submission from anyone in the industry.

**Implementation:**
```
Database:
- New migration: community_signals
  (id, submitter_id (nullable), project_id, signal_type, content,
   anonymous BOOLEAN, status: pending|verified|rejected, reviewed_by, created_at)

Frontend:
- src/pages/Explore.tsx or project detail: "Submit a signal" button (open to all, including anonymous)
- src/pages/dashboard/Review.tsx - extend to show community signals queue

Edge Functions:
- Community signal triggers researcher review notification
- Verified signals create evidence_sources and/or alerts
```

#### 6.11 Document Intelligence Layer

**What it is:** Bulk ingestion and AI extraction from public infrastructure documents.

**Tools needed:**
- Firecrawl: already integrated - crawl EIA portal pages and extract PDF links
- PDF parsing: Firecrawl's native PDF support or pdf-parse (npm)
- Claude API: extract structured data from document text

**Key document sources:**
- World Bank project appraisal documents (PADs): documents.worldbank.org (public)
- ADB project documents: docs.adb.org (public)
- EBRD project documents: ebrd.com/work-with-us/projects (public)
- National EIA registers: country-specific portals

**Implementation:**
```
Edge Function: supabase/functions/document-intel-agent/index.ts
1. For each approved project with source_url, fetch the primary document
2. Firecrawl to extract readable text from PDF/HTML
3. Claude prompt to extract: commitments, timelines, financial terms, environmental conditions
4. Store extracted data in: raw_sources table (already exists) with source_type = 'pdf'
5. Compare against project metadata: flag contradictions in project_updates changelog
6. "Document contradiction detector": alert if filed commitment diverges from current status

Example contradiction:
- Project appraisal document (2021): "Construction to begin Q1 2023"
- Current project status: still in Financing stage (2025)
- Alert generated: "Timeline commitment not met - 2yr overrun vs. original appraisal"
```

#### 6.12 Contractor Financial Health Monitor

**What it is:** Monitor financial filings of the top 200 EPC contractors globally.

**The Carillion lesson:** When UK contractor Carillion collapsed in January 2018, over $2 billion of infrastructure projects went into immediate distress. Nobody had a system to detect it in advance - Carillion's profit warnings were public but nobody connected them to project risk. InfraRadar can be that system.

**Implementation:**
```
Data sources:
- SEC EDGAR (free): US-listed contractors (Fluor, Jacobs, Bechtel spin-offs)
- Companies House (free): UK-listed contractors
- OpenCorporates API (free): European company data
- Firecrawl: annual report summaries from company websites

Edge Function: supabase/functions/contractor-intel-agent/index.ts
Signals to extract:
- Revenue trend (year-over-year change)
- Debt/equity ratio change
- Backlog size (industry metric for future work pipeline)
- Credit rating changes
- Profit warning announcements
- Layoff announcements
- Subsidiary dissolution

Health score formula (base 100, subtract for negative signals):
- Revenue declining >20% YoY: -30 pts
- Credit downgrade: -25 pts
- Profit warning issued: -20 pts
- Backlog declining >15% YoY: -15 pts
- Legal proceedings filed: -10 pts
- Layoffs >10% workforce: -10 pts

When contractor health_score < 40:
-> Create "Contractor distress" alert for all associated projects
-> Severity: critical if contractor is Lead, high if Consortium member
```

---

## 7. Pricing

| Tier | Price | Target Buyer |
|---|---|---|
| Free | $0 | Discovery, DFI staff exploring |
| Starter | $29/mo | Individual analysts, small teams |
| Pro | $199/mo | Regional specialists, project finance teams |
| Enterprise | Custom | Banks, DFIs, consulting firms |
| Enterprise API | $500+/mo | Firms embedding InfraRadar in workflows |

### What Each Tier Gets

**Free:**
- 2 AI queries/day, 3 insight reads/day, 1 export/day
- Core project discovery, basic alerts

**Starter ($29/mo):**
- 20 AI queries/day, 50 insight reads/day, 20 exports/day
- Full alert rules, portfolio chat, saved searches

**Pro ($199/mo):**
- 100 AI queries/day, 200 insight reads/day, 100 exports/day
- Everything in Starter plus: delay risk scores, early warning alerts, contractor intelligence, permit tracker
- Annual billing option (save 20%)

**Enterprise (Custom):**
- Unlimited everything
- API access + webhooks, SSO/SAML, dedicated onboarding, SLA guarantees, white-label reports

---

## 8. Sales Motion

**Who buys (priority order):**

1. **DFI Analysts** (World Bank, AfDB, ADB, IFC staff)
   - Need: monitor project portfolios they fund
   - Current tool: manual spreadsheets
   - Entry: Free tier -> Starter conversion
   - Channel: DFI conference presence, content marketing

2. **Project Finance Teams** (banks structuring infrastructure loans)
   - Need: early warning signals before loans go non-performing
   - Entry: Pro ($199/mo) - immediate 10x ROI vs consultant costs at $50k+ per engagement
   - Channel: LinkedIn, direct outreach to Standard Chartered, Societe Generale, Standard Bank infrastructure desks

3. **EPC Contractors** (Bechtel, Fluor, Consolidated Contractors, POSCO E&C)
   - Need: find tenders before competitors, track pipeline
   - Entry: Starter -> Pro upgrade for contractor intelligence
   - Channel: industry events (MEED Projects, Africa Investment Forum)

4. **Private Equity Infrastructure Funds**
   - Need: deal flow and project due diligence
   - Entry: Pro or Enterprise
   - Channel: direct outreach to Brookfield, Macquarie, Actis infrastructure teams

5. **Government Ministries** (infrastructure, planning, finance)
   - Need: monitor peer countries, attract investment
   - Entry: Enterprise
   - Channel: partnerships with national planning agencies

6. **Consulting Firms** (McKinsey, Arup, Jacobs, WSP, PwC)
   - Need: project intelligence for client engagements
   - Entry: Enterprise with white-label
   - Channel: direct partnership approach

**Content marketing funnel:**
- Publish free quarterly MENA/Africa infrastructure reports (generated from our data)
- Weekly "InfraRadar Intelligence" LinkedIn posts with infrastructure data insights
- "InfraRadar GICI" monthly benchmark - cited by media and DFIs
- Annual Infrastructure Delay Report - gets media pickup

---

## 9. The 5-Year Plan

**Year 1:** Own MENA and East Africa infrastructure intelligence. Be the free-to-cite source that DFI analysts use. Launch delay risk scoring.

**Year 2:** Launch contractor intelligence database and ML-powered delay prediction. Launch API access for enterprise. First white-label partnership with a major consulting firm.

**Year 3:** Community verification network reaches critical mass. Platform accuracy improves faster than any competitor can match. GICI index cited in UN reports.

**Year 5:** InfraRadar is the authoritative, real-time, AI-native infrastructure intelligence platform - the one every DFI, EPC contractor, and infrastructure fund uses. The GICI index is a standard industry benchmark.

---

## 10. Technical Notes for Future Implementation

### 10.1 Keep in Sync (Critical)
`supabase/functions/_shared/billing.ts` and `src/lib/billing/limits.ts` define the same PLAN_LIMITS. When adding the Pro tier ($199/mo), update BOTH files manually.

### 10.2 Agent Registration Pattern
Every new ingest agent must be:
1. Created in `supabase/functions/{name}/index.ts` following the pattern in `supabase/functions/_shared/`
2. Added to `src/lib/api/agents.ts` under `agentApi.*`
3. Added to `agent_config` table via migration
4. Added as a trigger button in `src/pages/dashboard/AgentMonitoring.tsx`

### 10.3 RLS Policies
Every new table needs Row Level Security policies. Follow the pattern in existing migrations - all tables use `auth.uid()` checks. New tables with community/anonymous content need special handling.

### 10.4 Type Safety
After adding new tables via migration, regenerate types: `supabase gen types typescript --project-id [ID] > src/integrations/supabase/types.ts`. Never hand-edit types.ts.
