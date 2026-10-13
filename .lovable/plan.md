# Frontier-first discovery, real decision-maker contacts, and sellable custom reports

## Where we are today (last 30 days of new projects)

- Generic "Infrastructure" still dominates: 868 new of ~1,400.
- Frontier sectors are now growing but small: Semiconductors 75, Space 51, Data Centers 44, Hydrogen 40, Battery 32, Nuclear 20, **AI Infrastructure only 15**, Defence 12.
- Building Construction: **0 new** in 30 days. Power-for-AI (grid, substations, gas peakers, PPAs) isn't tracked as its own theme.
- Research currently runs on Firecrawl search only, so results are search snippets, not deep, cited answers. Many frontier projects arrive without named people.

## What we will build

### 1. Sector priority you control
A "Sector focus" setting in the Agents Hub with weights per sector (default: AI/compute, power for AI, semiconductors, batteries, nuclear, hydrogen, data centres high; construction and classic sectors medium, not zero). Every research run splits its budget by these weights, so frontier sectors get most attention while construction is still covered. A small coverage chart shows new projects per sector per week against target.

### 2. Better frontier research
- New themes: power for AI (grid connections, substations, transmission, on-site gas/nuclear, PPAs), cooling and water for data centres, chip supply chain (equipment, materials, packaging), critical minerals processing, large commercial/mixed-use construction.
- Watch lists of the companies driving these markets (hyperscalers, chipmakers, battery makers, utilities, SMR developers, EPCs) — the agent checks their news/investor pages and planning filings regularly, instead of only open web searches.
- Official signal sources: planning/permit portals, grid interconnection queues (e.g. US ISO queues), government subsidy awards (CHIPS Act, EU Chips Act, IRA, IPCEI), environmental-impact filings. These surface projects early, before press coverage.
- Each new project is updated over time (new phase, contractor award, financing), not just added once.

### 3. Research providers (layered, each optional)
| Provider | Role |
|---|---|
| Perplexity (re-enable, your key) | Grounded cited answers; deep-research mode for reports |
| Exa (new, your key) | Semantic search for company/people pages and similar-project discovery |
| Firecrawl (existing) | Read and extract from the actual pages and PDFs |
| Lovable AI | Extraction, scoring, writing — never as a source of facts |

The research router tries them in a sensible order per task, records which provider found what, and still works if one runs out of credits. Optional later: Apollo or Hunter for verified business emails (paid, flagged per use).

### 4. Right people, not just generic contacts
For frontier projects the contact finder targets roles customers want: project director/manager, procurement/supply-chain lead, head of construction, EPC/general contractor lead, site/plant manager, investor-relations or development lead. It:
- Finds names on cited pages (press releases, permit filings, LinkedIn-style public bios via search).
- Only stores email/phone found verbatim on a cited page, or a pattern-derived email clearly marked "unverified, guessed format" (optional email-verification provider can upgrade it).
- Shows role, organisation, source link and confidence for each person.

### 5. Custom reports that justify a high price
Upgrade Report Studio so a user can build a report like the paid ones competitors sell:
- Choose scope: sector(s), regions, value range, stage, time window, specific companies.
- Choose sections: market overview, project pipeline table, top projects deep-dives, key players and contractors, contacts list (paid plans), risks, outlook.
- Choose depth: quick (minutes) or deep research (uses Perplexity deep research and fresh crawling).
- Every figure and claim cited; branded PDF and Excel export; save as template and schedule (weekly/monthly).
- A preview step before spending credits, and clear progress while it runs.
- We test end-to-end with a real report for "AI data centres in the Gulf" and "chip fabs in Europe" before calling it done.

## What I need from you
- Perplexity API key and an Exa API key (I'll prompt for them securely). Exa is what I believe you meant by the "agentic search" option; tell me if you meant another service.
- Whether you want a paid email-verification service now (Hunter/Apollo) or later.

## Technical details
- New table `sector_focus` (weights, staff-editable via RLS) read by `research-agent` and `frontier-intel-agent` to allocate per-run query budgets; add themes to `_shared/sectors.ts`; add a construction query set.
- `_shared/researchRouter.ts`: add `exaClient.ts`; mode-based ordering (discovery: Exa → Firecrawl; grounded: Perplexity → Exa+Firecrawl scrape; deep: Perplexity sonar-deep-research); `RESEARCH_PROVIDER=auto` default once keys exist; provider recorded in provenance.
- New `watchlist_entities` table + bounded scheduled agent `company-watch-agent` (single-flight lock, batch cap, 402/403 pause) using `firecrawlMap`/scrape on IR/newsroom pages; new source adapters for interconnection queues and subsidy award lists through `pipelineIngest` staging.
- `contact-finder`: role-targeted queries per project, Exa people/company search, `email_status` (verified_on_page / pattern_guess / provider_verified), keep verbatim-citation rule.
- Report Studio: extend `report-agent` with scope/section/depth config, template table, Excel export, credit preview via `consume*Quota`; scheduled via existing `report-scheduler`.
- Re-tag pass for existing "Infrastructure" rows that match frontier/construction keywords.
- Tests: sector-weight budget allocation, email-status rules, report quota consumption.

## Out of scope
Pricing changes and approval-rule changes.
