

# On-Demand Research Hub — Live Visual Research for Users

## Concept

A new **Research** page accessible from the dashboard sidebar where users can type a natural-language query (e.g., "King Salman Airport expansion details" or "renewable energy projects in Kenya") and watch a multi-agent research process unfold visually in real time. At the end, they receive a structured project report with sources — or suggestions for similar projects if nothing is found.

## User Flow

```text
┌─────────────────────────────────────────────────────┐
│  RESEARCH HUB                                       │
│                                                     │
│  ┌───────────────────────────────────┐  [Research]  │
│  │ "Port expansion projects in Ghana" │             │
│  └───────────────────────────────────┘              │
│                                                     │
│  ┌─ LIVE RESEARCH VISUALIZATION ──────────────────┐ │
│  │                                                 │ │
│  │  [Perplexity] ──searching──▶ 12 results found   │ │
│  │  [Firecrawl]  ──scraping───▶ 8 pages scraped    │ │
│  │  [AI Extract] ──analyzing──▶ 3 projects found   │ │
│  │  [Enrichment] ──verifying──▶ contacts, URLs     │ │
│  │                                                 │ │
│  │  Sources being visited:                         │ │
│  │   ✓ meed.com/ghana-port...                      │ │
│  │   ◷ constructionweek.com/tema...                 │ │
│  │   ◷ afdb.org/projects/...                        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ── OR after completion ──                          │
│                                                     │
│  ┌─ RESEARCH REPORT ─────────────────────────────┐  │
│  │  Found: 3 matching projects                    │  │
│  │  ┌─ Tema Port Phase 3 ──────────────────────┐  │  │
│  │  │  Country: Ghana | Sector: Transport       │  │  │
│  │  │  Value: $1.5B | Stage: Under Construction │  │  │
│  │  │  Contacts: 2 found | Sources: 4 verified  │  │  │
│  │  │  [View Full Details] [Save to Projects]    │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │  Similar projects you might be interested in:  │  │
│  │  • Lome Port Expansion (Togo) — 85% match     │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  [Set Alert for Updates]  [Export Report]            │
└─────────────────────────────────────────────────────┘
```

## Architecture

### Backend: New Edge Function `user-research`

A dedicated edge function that:
1. Accepts a user query + optional user_id
2. Creates a `research_tasks` entry with `task_type: 'user-research'` and status `running`
3. Runs a multi-step pipeline, updating the task's `result` JSONB field at each step so the frontend can poll for progress:
   - **Step 1 — Search**: Use Perplexity to find relevant sources. Write `{ step: 'searching', sources_found: N, queries: [...] }` to result
   - **Step 2 — Scrape**: Use Firecrawl to scrape top results. Update `{ step: 'scraping', pages_scraped: N, urls: [...] }`
   - **Step 3 — Extract**: Use AI (Lovable AI) to extract structured project data. Update `{ step: 'extracting', projects_found: N }`
   - **Step 4 — Enrich**: Cross-reference with existing DB projects, find contacts, verify URLs. Update `{ step: 'enriching', contacts_found: N }`
   - **Step 5 — Complete**: Final report with all projects, sources, contacts, and similar project suggestions from the database
4. On completion, set status to `completed` with full structured report in `result`
5. If nothing found, populate `result.suggestions` with similar projects from the DB based on region/sector matching

### Frontend: New Page `src/pages/dashboard/Research.tsx`

**Search bar** at top — large, prominent input with a "Research" button.

**Live visualization panel** that polls `research_tasks` every 2 seconds while status is `running`:
- Animated pipeline showing each agent stage with status indicators (spinning, checkmark, pending)
- Live source list showing URLs being visited with status icons (loading spinner → checkmark)
- Step progress bar across the top
- Agent icons (Perplexity, Firecrawl, AI) with animated connections between them

**Report panel** shown on completion:
- Structured cards for each discovered project with key fields
- Source URLs with verification badges
- Contacts with email/phone links
- "Save to Projects" button that inserts into the `projects` table as pending
- "Similar Projects" section querying existing DB by matching region + sector
- "Set Alert" button that creates an alert subscription so the user gets notified of future updates
- "Export Report" button for a downloadable summary

**Research history** sidebar/section showing past user research tasks from `research_tasks` table filtered by `task_type: 'user-research'`.

### Navigation

Add "Research" to the **Core** nav group in `DashboardLayout.tsx` with a `Search` icon — this is a primary user-facing feature, not an admin tool.

### API Layer

Add `runUserResearch(query: string)` to `src/lib/api/agents.ts` that invokes the `user-research` function with the query body.

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `supabase/functions/user-research/index.ts` — multi-step research pipeline with progress updates |
| Create | `src/pages/dashboard/Research.tsx` — full research hub page with live viz + report |
| Modify | `src/lib/api/agents.ts` — add `runUserResearch` |
| Modify | `src/layouts/DashboardLayout.tsx` — add Research to Core nav group |
| Modify | `src/App.tsx` — add `/dashboard/research` route |

## Technical Notes

- Progress polling uses `useQuery` with 2s `refetchInterval` while task is `running`, stops on `completed`/`failed`
- The edge function updates `research_tasks.result` JSONB incrementally at each step — no websockets needed
- Similar project matching uses a simple DB query: `SELECT * FROM projects WHERE region = X OR sector = Y ORDER BY confidence DESC LIMIT 5`
- "Save to Projects" inserts with `approved: false` so it goes through the Review Queue
- Research history filtered by authenticated user's ID (stored in the task)

