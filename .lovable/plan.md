# Fix contact and evidence coverage on ingested projects

## What I found (verified against production)

- **The contact-finder agent is currently broken.** Its last three scheduled runs (06:00, 08:01, 10:00 today) failed in the "Canonicalizing existing contacts" step. The stored error is literally `[object Object]`, so the real cause was never recorded. The cursor is frozen at 1 Apr 2026, so every run retries the same batch and fails again.
- **It never reaches the discovery step.** The agent only researches new contacts *after* the legacy canonicalisation backlog is fully drained. Of 6,931 legacy contacts, roughly 1,900 have been processed. So contact discovery has effectively been off.
- **Even when discovery runs, it can only see the 50 newest projects and processes 2 per run.** There is no queue over the backlog. Today: 4,539 approved projects, only 1,214 have any contact. Of the 1,450 projects created in the last 14 days, **3** have contacts.
- **Evidence is thin, not missing.** 1,399 of the last 1,450 projects have exactly one source: the registry URL the ingest agent used. Nothing corroborates or expands it, and no agent scrapes the official project page for the extra detail (documents, contacts, tender data) that is visible on those websites.
- **Contacts are only saved when the research provider returns real citations.** If the provider degrades to the citation-less fallback, the run silently persists nothing and just records a "degraded" event — invisible in the dashboard.

So: nothing is fundamentally worse than the Firecrawl era; the agent is stalled, blocked behind a backlog, and scoped to 50 projects.

## What we will build

### 1. Unstall and harden the agent
- Record the real database error (message, detail, hint) instead of `[object Object]`.
- Wrap each row of the canonicalisation batch in its own error handler: a bad row is skipped and logged, the cursor always advances, one row can never freeze the pipeline again.
- Raise the batch size and add a time budget so the remaining ~5,000 legacy contacts drain in days, not weeks.

### 2. Stop discovery being blocked
Every run does canonicalisation **and** discovery within its time budget, instead of discovery waiting for a fully drained backlog.

### 3. A real coverage queue instead of "50 newest"
- Durable cursor over *all* approved projects that have no reachable contact, prioritised by project value and recency.
- Larger per-run discovery batch, bounded by the time budget.
- Never re-research the same project within a cooldown window, so the queue keeps moving.

### 4. Scrape the project's own page first (cheap and highest yield)
Before any AI research, scrape the registry/official project URL we already store and extract contacts, documents and related links from it. This is exactly what a person sees when they open the website, and it costs no reasoning credits.

### 5. Reuse organisation-level contacts
When a company (EIB, World Bank, a ministry, a contractor) already has verified, source-backed contacts, attach them to new projects that company is linked to, marked as organisation-level rather than project-specific. This lifts coverage on thousands of projects without a research call each.

### 6. Evidence enrichment
Extend enrichment so each project gains corroborating sources beyond the single ingest URL: official project page, tender/award notices, financing documents, credible news. Every source keeps its URL, is link-validated, and unverifiable ones are not written.

### 7. Make the gaps visible
- Coverage panel on the Agents Hub: percentage of projects with contacts, with more than one source, and the size of the remaining queue.
- Alert when a research provider degrades to citation-less mode, so silent no-op runs surface instead of hiding.
- Temporarily run the agent hourly until the backlog is drained, then back to the normal cadence.

### 8. Backfill already-approved projects
The queue in step 3 covers existing approved projects too, so the 3,300 projects currently without contacts are re-processed automatically — no manual re-approval needed.

## Technical notes

- `canonicalize_contact_batch`: per-row `BEGIN ... EXCEPTION WHEN OTHERS` so failures are counted and skipped; returns the skipped count.
- `contact-finder/index.ts`: serialise the caught error properly; run canonicalisation then discovery under one `TIME_BUDGET_MS`; replace `loadDiscoveryProjects`'s "50 newest" query with a cursor-backed query over projects lacking a reachable contact; add a scrape-first path via `firecrawlScrape` on `projects.source_url` before falling back to `fetchAgentResearch`; keep the existing rule that only citation-backed contacts are persisted.
- New cursor/cooldown columns on `agent_config` (discovery cursor) and a `last_contact_scan_at` on projects, with the usual RLS/grants.
- Organisation-level reuse goes through the existing `companies` / `company_project_roles` / `upsert_canonical_contact` path, flagged so the UI can distinguish it from project-specific contacts.
- Evidence writes reuse `urlHygiene` plausibility checks and `source_link_checks`.

## Out of scope

No change to the verification/approval workflow, plan gating on contact PII, or the report studio.
