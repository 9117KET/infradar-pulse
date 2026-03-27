

# Real-Time Intelligence Data Architecture

## Vision

Replace static mock data with a live, AI-powered intelligence pipeline that continuously discovers, enriches, verifies, and updates infrastructure project data. The platform becomes a living system where agents scrape news, AI models extract structured project data, confidence scores update based on recency, and the dashboard reflects real-world changes.

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│                   DATA SOURCES                       │
│  Firecrawl (news scraping) + Perplexity (research)  │
│  + Public APIs (World Bank, AfDB)                    │
└──────────────┬──────────────────────────────────────┘
               │ Edge Functions (scheduled + on-demand)
               ▼
┌─────────────────────────────────────────────────────┐
│              AI ENRICHMENT LAYER                     │
│  Gemini/GPT: extract project fields, confidence,    │
│  risk scoring, conflict detection, summaries         │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│              DATABASE (Lovable Cloud)                 │
│  projects, project_updates, evidence_sources,        │
│  research_tasks, alerts (all with realtime)          │
└──────────────┬──────────────────────────────────────┘
               │ Supabase Realtime
               ▼
┌─────────────────────────────────────────────────────┐
│              FRONTEND                                │
│  Globe, Dashboard, Alerts — all live-updating        │
└─────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Database Schema
Create tables to store real project data:
- **`projects`** — core fields matching current `Project` interface (name, country, region, sector, stage, status, value, confidence, risk_score, lat, lng, description, timeline, last_updated)
- **`project_stakeholders`** — many-to-many relationship
- **`project_milestones`** — milestone tracking per project
- **`evidence_sources`** — each piece of evidence with source, type, verified flag, date, url
- **`project_updates`** — changelog of AI-discovered updates with timestamps
- **`research_tasks`** — queue for agent research jobs (pending/running/completed/failed)
- **`alerts`** — generated alerts from anomaly detection

Enable Supabase Realtime on `projects` and `alerts` tables so the frontend updates live.

### Phase 2: Research Agent Edge Functions

**`research-agent`** — The core intelligence agent:
1. Uses **Firecrawl** to scrape infrastructure news sources (MEED, IJGlobal, Construction Week, African Business, etc.)
2. Uses **Perplexity** (sonar-pro) for deep research queries like "latest infrastructure projects in Kenya 2025"
3. Passes scraped content to **Lovable AI** (Gemini) with a structured schema to extract: project name, country, sector, stage, estimated value, coordinates, stakeholders, confidence level
4. Upserts results into the database
5. Runs conflict detection: if new data contradicts existing records, flags for review and creates an alert

**`update-checker`** — Periodic update agent:
1. For each existing project, searches recent news via Firecrawl/Perplexity
2. AI compares new findings against stored data
3. Updates confidence scores based on evidence recency (scores decay over time)
4. Detects stage changes, delays, cancellations
5. Creates entries in `project_updates` and `alerts`

**`risk-scorer`** — Risk analysis agent:
1. Analyzes geopolitical news, currency data, supply chain signals
2. Updates `risk_score` on projects
3. Creates risk alerts when thresholds are crossed

### Phase 3: Connectors Setup
- **Firecrawl** connector — for web scraping infrastructure news sites
- **Perplexity** connector — for AI-powered research queries
- Both connected via the Lovable connector system (secrets auto-injected into edge functions)

### Phase 4: Frontend Integration
- Replace `src/data/projects.ts` static array with database queries
- Create React hooks: `useProjects()`, `useProjectDetail(id)`, `useAlerts()`
- Subscribe to Supabase Realtime for live updates on globe and dashboard
- Add "Research Status" indicator showing agent activity
- Dashboard stats (total projects, total value, avg confidence) computed from live data
- Globe markers pull from database instead of static file

### Phase 5: Admin Controls
- Manual trigger button to run research agents on demand
- View research task queue and status
- Review and approve/reject AI-discovered projects
- Override confidence scores and risk assessments

## Services Implementation
The Services page modules map directly to agent capabilities:
- **Real-time project monitoring** → `update-checker` agent
- **Satellite verification** → stub (flag for future satellite API)
- **Multi-source validation** → Firecrawl multi-source scraping + AI cross-referencing
- **Geospatial intelligence** → Globe with live database markers
- **Risk and anomaly signals** → `risk-scorer` agent + alerts table
- **Decision-ready reporting** → CSV/PDF export from live data

## What This Requires From You
1. **Firecrawl connector** — needs to be connected (has a free tier)
2. **Perplexity connector** — needs to be connected (has a free tier)
3. Approval to create ~7 database tables and ~3 edge functions

## Phased Delivery
We can build this incrementally:
1. **First**: Database + migrate existing mock data + frontend reads from DB
2. **Second**: Connect Firecrawl + Perplexity, build research agent
3. **Third**: Update checker + risk scorer + realtime subscriptions
4. **Fourth**: Admin controls + reporting

