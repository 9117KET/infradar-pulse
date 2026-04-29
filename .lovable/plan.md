## Diagnosis: why the current agent system is underperforming

The current setup has the right building blocks, but the workflow is too “agent-per-feature” and not enough “intelligence pipeline.” The result is inconsistent quality, duplicated work, weak verification, and a Review Queue that only checks a few obvious fields.

Current issues I found:

1. Discovery relies too heavily on generated research summaries instead of a source-first crawl/extraction model.
2. Several agents write directly into final tables without a strong staging/evidence layer.
3. Quality rules are scattered across agent prompts, the Review Queue, and utility functions instead of being enforced centrally.
4. Agent monitoring shows runs and coverage, but not enough about data quality, source reliability, queue bottlenecks, confidence changes, or why projects fail verification.
5. Review Queue approval is too simple: approve/reject based mostly on source/contact presence, instead of a structured quality checklist.
6. Agent interactions are not orchestrated. Discovery, enrichment, deduplication, update checking, contacts, and risk scoring should behave like stages in one pipeline, not independent buttons.
7. Current tasks use `research_tasks`, but there is no durable per-project pipeline state like “discovered → extracted → deduped → enriched → verified → approved → monitored.”

## Proposed rebuild: source-first Infrastructure Intelligence Pipeline

I would redesign the platform around this flow:

```text
Source Registry
   ↓
Source Ingest Agent
   ↓
Raw Evidence Store
   ↓
Extraction Agent
   ↓
Candidate Project Staging
   ↓
Dedup + Entity Resolution
   ↓
Enrichment Agents
   ↓
Quality Scoring + Verification Rules
   ↓
Review Queue
   ↓
Approved Project Graph
   ↓
Continuous Monitoring + Update Agents
```

This means agents no longer independently “invent” or directly finalize records. They feed an auditable pipeline where every project has sources, extraction evidence, quality metrics, and review history.

## Key architectural changes

### 1. Add a proper Source Registry

Create a managed registry of source types:

- Multilateral development banks: World Bank, IFC, ADB, AfDB, EBRD, IADB, AIIB
- Government procurement portals
- PPP units
- Energy/water/transport regulators
- Tender portals
- Company press releases
- News and trade publications
- Satellite / geospatial intelligence sources where available

Each source should have:

- source name
- source type
- region/country coverage
- reliability score
- crawl frequency
- last successful ingest
- last failure
- whether it supports structured API, RSS, sitemap, or web scrape

This makes agent behavior observable and tunable instead of hardcoded.

### 2. Add a Raw Evidence layer

Before writing to `projects`, every agent should save source material into a raw evidence table:

- source URL
- title
- publication date
- extracted text / summary
- source type
- project candidate links
- hash/fingerprint to prevent duplicates
- fetch status
- extraction confidence

This creates auditability. If a project is later questioned, staff can see exactly where the claim came from.

### 3. Add Candidate Projects separate from approved Projects

Instead of using `projects.approved = false` as the main staging mechanism, create a dedicated candidate layer:

- candidate project name
- normalized name
- country / region
- sector / subsector
- stage
- value estimate
- timeline
- extracted claims
- source evidence IDs
- duplicate candidates
- quality score
- review status

Only after review should data be promoted into the final `projects` table.

This avoids polluting production project records with low-confidence or incomplete AI output.

### 4. Centralize the quality scoring model

Add one shared quality scoring function used by all agents and Review Queue.

Suggested score dimensions:

- Source quality: official/MDB/government > trade press > generic article
- Source count: one source is weak; two or more independent sources is stronger
- URL validity: no placeholder, no homepage-only URL, no broken URL
- Project specificity: project has a real name, location, sector, value, stage, timeline
- Financial confidence: value has source and currency/date context
- Stakeholder confidence: owner, contractor, financier, authority, or consultant identified
- Recency: last source/update date
- Geospatial confidence: coordinates are project/site-level, not just country centroid
- Contradiction risk: conflicting stage/value/timeline across sources
- Completeness: core fields are filled

Example approval gates:

```text
Auto-approve: 85+ quality score, 2+ strong sources, no contradictions
Staff review: 50–84 quality score
Reject / needs research: below 50 or missing source URL
Never approve: no source URL, placeholder source, unverifiable project name
```

This aligns with the project rule that all projects require source URLs and unverified records cap at 30% confidence.

## Agent redesign

### A. Source Ingest Agents

Purpose: fetch new data from registered sources.

Keep existing MDB ingest agents, but refactor them to write into raw evidence and candidates first, not directly to final project records.

Agents:

- World Bank ingest
- IFC ingest
- ADB ingest
- AfDB ingest
- EBRD ingest
- IADB ingest
- AIIB ingest
- Source ingest from URL
- Tender/procurement ingest
- News/trade publication ingest

Output:

- raw evidence rows
- candidate project rows
- source run logs

### B. Extraction Agent

Purpose: turn raw source text into structured project candidates.

It should extract:

- project name
- location
- sector/subsector
- stage
- value
- funding source
- stakeholders
- dates
- risks
- source-backed claims

Important change: every extracted field should include the source/evidence it came from, not just the final value.

Example:

```text
field: value_usd
value: 2500000000
source_evidence_id: abc
confidence: 82
quote: “The project is valued at…”
```

### C. Entity Resolution / Dedup Agent

Purpose: merge duplicates before review.

It should compare:

- normalized project name
- country/region
- sector
- coordinates
- sponsor/stakeholder names
- source URLs
- financing institution project IDs

It should produce:

- “same project” suggestions
- duplicate confidence
- canonical project candidate
- merge preview for staff

### D. Enrichment Agent

Purpose: fill gaps only after a candidate/project exists.

Sub-agents:

- Funding enrichment
- Stakeholder/contact enrichment
- Risk enrichment
- ESG/social enrichment
- Regulatory/permitting enrichment
- Tender/award enrichment
- Geospatial/site enrichment

Each enrichment should add evidence-backed claims, not overwrite fields blindly.

### E. Update Monitor Agent

Purpose: monitor approved projects over time.

It should:

- check source URLs for changes
- search recent updates from authoritative sources
- detect stage changes, delays, cancellations, awards, financing close, commissioning
- create update proposals instead of directly changing high-impact fields
- reduce confidence if sources go stale

Review Queue should then show “update proposals” as well as “new project candidates.”

### F. Alert Intelligence Agent

Purpose: convert verified updates into actionable alerts.

Better alert types:

- stage change
- delay risk
- financing risk
- procurement event
- contract award
- cancellation/stoppage
- regulatory/permitting issue
- ESG/social controversy
- security/resilience incident
- supply chain issue

Alerts should link to source evidence and affected projects.

## Review Queue redesign

The Review Queue should become the “Intelligence Verification Workbench.”

### Current Review Queue

- Lists unapproved projects
- Shows basic fields
- Checks source/contact presence
- Approve/reject

### Redesigned Review Queue

It should have tabs:

1. New project candidates
2. Duplicate/merge suggestions
3. Enrichment proposals
4. Update proposals
5. Low-confidence records
6. Broken/stale sources

Each item should show:

- quality score
- confidence score
- source count
- official source status
- missing fields
- contradictions
- duplicate risk
- last agent that touched it
- evidence excerpts
- source URLs
- recommended action

Reviewer actions:

- approve candidate
- request more research
- merge with existing project
- reject candidate
- approve selected fields only
- edit before approval
- assign to researcher
- add verification note/reason

Bulk approval should be removed or made very restricted. Bulk approval is risky for an intelligence product.

## Agent Monitoring redesign

The current Agent Monitoring page is useful, but it should shift from “did the function run?” to “is the intelligence pipeline healthy?”

### New monitoring sections

1. Pipeline Health
   - candidates discovered
   - candidates extracted
   - duplicates detected
   - candidates approved
   - candidates rejected
   - average time to approval
   - stuck items by pipeline stage

2. Data Quality
   - source URL coverage
   - 2+ source coverage
   - official source coverage
   - contact coverage
   - funding coverage
   - risk coverage
   - geospatial precision coverage
   - average confidence
   - stale project count

3. Agent Reliability
   - success rate by agent
   - failure reason categories
   - last run duration
   - records processed per run
   - retry count
   - API/source failures
   - output quality score by agent

4. Source Reliability
   - sources currently failing
   - sources with stale data
   - source freshness by region
   - source yield: how many valid candidates each source produces
   - source rejection rate

5. Review Bottlenecks
   - pending review count
   - high-value pending projects
   - high-confidence candidates waiting approval
   - candidates blocked by missing source/contact
   - assigned reviewer workload

6. Agent Controls
   - pause/resume
   - run now
   - run targeted by region/sector/source
   - dry-run mode
   - reprocess failed items
   - retry source
   - rebuild quality scores

## Better agent interactions

Instead of agents being isolated, they should trigger the next stage based on outcomes.

Example:

```text
World Bank Ingest completes
  → Extraction Agent runs on new raw evidence
  → Dedup Agent checks candidates
  → Enrichment Agent fills missing fields
  → Quality Scorer calculates readiness
  → Review Queue receives candidate
```

For approved projects:

```text
Update Monitor finds change
  → Evidence saved
  → Change proposal created
  → Risk/alert agents evaluate impact
  → Review Queue approves or rejects update
  → User alert/digest generated
```

This could be implemented with database task rows and scheduled functions first. Later, if needed, it could move to a durable workflow connector for more advanced orchestration.

## Database changes I would propose

Add these tables or equivalent structures:

1. `source_registry`
   - tracks sources, reliability, coverage, schedule, status

2. `raw_evidence`
   - stores fetched source documents and extracted snippets

3. `project_candidates`
   - staging layer before final project approval

4. `candidate_evidence_links`
   - links candidates to supporting evidence

5. `project_claims`
   - field-level claims with source references

6. `agent_runs`
   - richer replacement/complement for `research_tasks`

7. `agent_run_events`
   - step logs, errors, counters, quality metrics

8. `quality_scores`
   - per candidate/project quality breakdown

9. `review_actions`
   - audit trail of approvals, rejections, overrides, merge decisions

10. `update_proposals`
   - proposed changes to approved projects before applying them

This would preserve current tables while adding a stronger intelligence pipeline around them.

## Frontend changes

### Agent Monitoring page

Rebuild into a Command Center with:

- pipeline overview cards
- source health table
- quality coverage matrix
- per-agent run timeline
- error drilldowns
- stuck queue panel
- agent controls
- charts by region/sector/source

### Review Queue page

Rebuild into a Verification Workbench with:

- tabs by review item type
- quality score card
- evidence viewer
- field-by-field diff/approval
- duplicate merge UI
- source validation status
- reviewer notes
- request-more-research action

### Project Detail page

Add:

- evidence-backed field history
- source confidence section
- update history
- claim provenance
- “why this confidence score?” explanation

## Implementation plan

### Phase 1: stabilize and measure

- Audit all existing agents for auth, task lifecycle, error handling, and direct writes.
- Standardize every agent to use shared lifecycle helpers.
- Add richer task/run metadata: processed count, inserted count, updated count, skipped count, source count, quality count.
- Fix agents that do not call `finishAgentRun` consistently.
- Add clearer failure messages in monitoring.

### Phase 2: source-first data model

- Add source registry, raw evidence, candidate project, quality score, review action, and update proposal tables.
- Add RLS policies so only staff can manage internal intelligence workflow data.
- Keep public users limited to approved project data only.

### Phase 3: refactor ingest and discovery

- Convert MDB ingest agents to write evidence/candidates first.
- Refactor Research Agent into Source Discovery + Extraction instead of direct project creation.
- Add dedup before any candidate reaches review.
- Enforce source URL and confidence caps centrally.

### Phase 4: rebuild Review Queue

- Replace simple unapproved-project review with a multi-tab verification workbench.
- Add quality scoring, evidence excerpts, duplicate suggestions, and field-level approval.
- Remove unsafe bulk approval or restrict it to high-confidence candidates only.

### Phase 5: rebuild Agent Monitoring

- Add pipeline health metrics.
- Add source health metrics.
- Add quality coverage metrics.
- Add per-agent reliability and output quality metrics.
- Add targeted run controls.

### Phase 6: continuous monitoring and updates

- Convert update checker to create update proposals instead of directly mutating important fields.
- Connect alerts/digests to approved update proposals.
- Add stale source detection and automatic “needs refresh” queue.

## Recommended first build step

I would start with Phase 1 and Phase 2 together:

1. Add the new source/evidence/candidate/quality/review schema.
2. Add a shared quality scoring function.
3. Refactor one agent first, probably World Bank ingest, into the new pipeline.
4. Rebuild Review Queue around candidates and quality scores.
5. Once the pattern works, migrate the other agents into the same architecture.

This avoids trying to rewrite all agents at once while immediately improving data quality and review accuracy.

## Expected result

After this rebuild, INFRADARAI would have:

- more reliable project discovery
- fewer hallucinated or weak records
- clear source provenance for every project
- stronger confidence scoring
- better reviewer workflows
- measurable agent performance
- better continuous project updates
- a more defensible intelligence product for infrastructure professionals