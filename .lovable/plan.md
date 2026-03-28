

# Agent Automation, Data Gap Filler & Enhanced Monitoring

## Problems Identified

1. **No pg_cron schedules exist** — all 10+ agents have never run automatically despite having defined schedules. They only execute on manual trigger.
2. **update-checker and risk-scorer don't log to `research_tasks`** — they appear as "Never run" on the monitoring page because they skip the task tracking insert.
3. **Many projects lack contacts, emails, and source URLs** — no agent specifically targets filling data gaps on existing projects.
4. **Agent Monitoring page is too static** — no visual representation of agent workflow or progress.

## Changes

### 1. Fix update-checker & risk-scorer to log to research_tasks

Both agents need the same pattern as other agents: insert a `research_tasks` row at start (status: running), update on completion/failure.

**Files:** `supabase/functions/update-checker/index.ts`, `supabase/functions/risk-scorer/index.ts`

### 2. Create a new "Data Enrichment" agent

A new edge function `data-enrichment` that:
- Scans all approved projects for missing fields (no source_url, no contacts, empty description, no evidence, missing detailed_analysis)
- For each project with gaps, uses Perplexity to search for the missing information
- Uses AI to extract and fill: source URLs, detailed analysis, key risks, funding sources, environmental impact, political context
- Logs progress to `research_tasks` so it appears on monitoring
- Creates alerts when significant data is added
- Processes 5-10 projects per run to stay within limits

**Files:** Create `supabase/functions/data-enrichment/index.ts`, add to `src/lib/api/agents.ts`, add to agent grid in `AgentMonitoring.tsx`

### 3. Set up pg_cron schedules for ALL agents

Enable `pg_cron` and `pg_net` extensions, then create cron jobs for all 12 agents:

| Agent | Schedule |
|-------|----------|
| research-agent | Every 30 min |
| update-checker | Every 2 hours |
| risk-scorer | Every 4 hours |
| stakeholder-intel | Every 6 hours |
| funding-tracker | Every 4 hours |
| regulatory-monitor | Every 3 hours |
| sentiment-analyzer | Every 2 hours |
| supply-chain-monitor | Every 4 hours |
| market-intel | Every 6 hours |
| contact-finder | Every 3 hours |
| alert-intelligence | Every 4 hours |
| data-enrichment | Every 2 hours |

**Method:** SQL insert tool (not migration) since it contains project-specific URLs/keys.

### 4. Enhance Agent Monitoring UI with visual workflow

Add to `AgentMonitoring.tsx`:
- **Agent Activity Timeline** — a Recharts area chart showing agent runs over the last 7 days by agent type
- **Data Coverage Dashboard** — visual bars showing what % of projects have contacts, emails, URLs, evidence, descriptions filled
- **Live Process Visualization** — when an agent is running, show an animated step-by-step workflow indicator (Searching → Extracting → Analyzing → Saving) based on task status
- **Health indicators** — agents that haven't run in > 2× their schedule period get a "Stale" warning badge

## Files Changed

| Action | File |
|--------|------|
| Modify | `supabase/functions/update-checker/index.ts` — add research_tasks logging |
| Modify | `supabase/functions/risk-scorer/index.ts` — add research_tasks logging |
| Create | `supabase/functions/data-enrichment/index.ts` — new data gap filler agent |
| Modify | `src/lib/api/agents.ts` — add `runDataEnrichment` |
| Modify | `src/pages/dashboard/AgentMonitoring.tsx` — activity chart, data coverage dashboard, live process viz, stale warnings |
| SQL insert | Enable pg_cron + pg_net, create 12 cron schedules |

