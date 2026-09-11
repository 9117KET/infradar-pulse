# Cover the new frontier sectors (AI, chips, batteries, nuclear, hydrogen, space)

Today the platform is heavily weighted to classic infrastructure. Out of ~25,700 projects: only 32 are tagged AI Infrastructure and 114 Data Centers, versus 6,361 generic Infrastructure, 4,851 Transport and 4,333 Energy. The reason is twofold: the research agent samples only about half its topic list on each run, so the one digital/AI topic group is rarely picked, and there is nowhere to file semiconductor fabs, gigafactories, small modular reactors, hydrogen plants or space/satellite ground infrastructure.

## What changes

**1. New sector categories**

Add six categories alongside the existing fourteen:

- Semiconductors (fabs, advanced packaging, equipment plants)
- Battery & Storage (gigafactories, grid-scale storage)
- Nuclear (large reactors and small modular reactors)
- Hydrogen (production, ammonia, pipelines, export terminals)
- Space & Satellite (launch sites, ground stations, satellite manufacturing)
- Defence & Security Infrastructure

These appear everywhere sectors are used: filters, explore page, sector snapshot on the landing page, pipeline review, natural-language search, and all ingest agents.

**2. Guaranteed frontier coverage in every research run**

The main research agent will always run a fixed set of frontier topics (AI data centres, power for AI, chip fabs, batteries, nuclear/SMR, hydrogen, subsea/space) on top of its rotating regional topics, instead of leaving them to chance. Topics are written to surface named, sourced projects with values, sponsors and timelines.

**3. A dedicated frontier-sectors agent**

A new scheduled agent focused only on emerging markets, running several times a day. It works by theme and region (for example "US and Gulf AI campus build-outs", "India and Southeast Asia fab and battery plants", "Africa green hydrogen and solar-plus-storage"), pulls sourced results through the existing Firecrawl-based research path, extracts structured projects with the same rules as the main agent (source URL required, low confidence when unverifiable), and feeds the same review/auto-approval pipeline. It appears in the Agents Hub with pause/resume, health and run history like the others, and reports gracefully when AI credits are unavailable.

**4. Re-tagging what we already have**

A one-off pass over existing projects: anything whose name or description clearly indicates a fab, gigafactory, reactor, hydrogen plant, AI/GPU campus or launch site gets moved into the right new category, so the new filters are useful from day one.

## Technical notes

- Migration: extend the `project_sector` enum with the six values; update `_coerce_sector` / `safe_cast_project_sector` mappings with synonyms (e.g. "gigafactory" to Battery & Storage, "SMR" to Nuclear, "fab"/"foundry" to Semiconductors) so ingest agents map cleanly instead of falling back to Infrastructure. Enum values must be committed before use in data updates.
- Constants: sector lists are duplicated in `research-agent`, `world-bank-ingest-agent`, `ifc-ingest-agent`, `nl-search`, `nl-search-public`, `src/data/coverage.ts`, `src/data/projects.ts`, `Explore.tsx`, `Pipeline.tsx`, `SectorSnapshotSection.tsx`. Introduce one shared list per side (`src/data/sectors.ts` and `supabase/functions/_shared/sectors.ts`) and point these at it.
- `research-agent`: keep group cycling, but always prepend a `frontier` group; add frontier queries per theme.
- New `supabase/functions/frontier-intel-agent`, modelled on `research-agent`: staff gate, `isAgentEnabled`/`beginAgentTask`/`finishAgentRun`, `gatewayFailure` handling for 402/403, `registerPipelineSource` + `stagePipelineProject` staging, row in `agent_config`, cron entry using the vault service-role JWT, and an entry in `src/lib/api/agents.ts`.
- Re-tagging runs as data SQL with keyword matching, restricted to unambiguous matches, logged so it can be reviewed.

## Out of scope

No change to approval rules, contact discovery, or pricing. AI-dependent runs still need available credits.
