

# Build All 6 New Intelligence Agents

## Current State
Three agents exist: `research-agent`, `update-checker`, `risk-scorer`. Six new agents were proposed. All required secrets (Firecrawl, Perplexity, Lovable AI) are already configured.

## New Agents to Build

### 1. Stakeholder Intelligence Agent (`stakeholder-intel`)
- Queries Perplexity for company/contractor news across project countries
- AI extracts relationship data, track records, conflict-of-interest patterns
- Updates `project_stakeholders` table, creates alerts for flagged entities

### 2. Funding & Financial Tracker (`funding-tracker`)
- Searches Firecrawl for development bank announcements (World Bank, AfDB, IFC, AIIB)
- Perplexity for bond issuances, sovereign wealth fund activity
- AI detects funding gaps, delayed disbursements, budget overruns
- Updates `value_usd`/`value_label` on projects, creates financial alerts

### 3. Regulatory & Compliance Monitor (`regulatory-monitor`)
- Perplexity searches for regulatory changes, EIA approvals, permit denials, sanctions
- AI flags compliance risks per project country/sector
- Creates high-severity alerts for sanctions or permit blocks

### 4. Sentiment & Media Analyzer (`sentiment-analyzer`)
- Firecrawl scrapes news about existing projects
- AI analyzes tone: positive/negative/neutral sentiment scoring
- Detects community opposition, labor disputes, political controversy
- Creates alerts when negative sentiment spikes

### 5. Supply Chain & Procurement Agent (`supply-chain-monitor`)
- Perplexity queries commodity prices (steel, cement, copper), shipping disruptions
- AI correlates supply chain risks to project sectors
- Updates risk scores when material cost spikes detected

### 6. Competitor & Market Intelligence (`market-intel`)
- Firecrawl + Perplexity for bidding activity, market share shifts, new entrants
- AI extracts company bidding patterns across regions
- Creates informational alerts for competitive intelligence

## Implementation

### Edge Functions (6 new files)
Each follows the same pattern as existing agents:
- CORS headers, Supabase client init
- Data collection via Firecrawl/Perplexity
- AI analysis via Lovable AI gateway with structured tool calls
- Database updates + alert creation
- Research task logging

### Frontend Updates

**`src/lib/api/agents.ts`** — Add 6 new agent invoke methods

**`src/pages/dashboard/Settings.tsx`** — Add 6 new trigger buttons with icons (Users, DollarSign, Scale, MessageSquare, Package, TrendingUp)

### Scheduling (Database)
Add cron jobs for each new agent:
- Stakeholder Intel: every 6 hours
- Funding Tracker: every 4 hours
- Regulatory Monitor: every 3 hours
- Sentiment Analyzer: every 2 hours
- Supply Chain: every 4 hours
- Market Intel: every 6 hours

## Files Changed
- **Created**: 6 edge function files in `supabase/functions/`
- **Modified**: `src/lib/api/agents.ts`, `src/pages/dashboard/Settings.tsx`
- **Migration**: 1 new migration for cron schedules

