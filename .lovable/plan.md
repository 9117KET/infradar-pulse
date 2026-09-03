# Scale to competitor-grade data volume

Target parity with MEED-class datasets: ~70k projects, ~40k companies, ~66k contacts — built entirely from free, public, citable sources so every record keeps its evidence trail.

## Where we are today

| Entity | Now | Target |
|---|---|---|
| Projects | 3,089 | 70,000 |
| Companies | 15 (`contractors`) | 40,000 |
| Contacts | 6,926 (`project_contacts`) | 66,000 |

The blocker is not the pipeline — it is throughput. The MDB ingest agents run **weekly** with a default page size of 200 records. World Bank alone publishes ~20k projects; we are sampling a fraction of it and never walking the full archive.

## Strategy

Three phases: bulk backfill (volume), entity extraction (companies), contact harvesting (people). Deterministic parsing does the bulk work; AI is used only for enrichment and disambiguation so cost stays flat as volume grows.

### Phase 1 — Bulk project backfill (3k → 70k)

- Add a **backfill mode** to every ingest agent: cursor-driven pagination that walks the entire upstream archive (not just Active/Pipeline — include Closed/Completed for historical company + contact extraction).
- Introduce a `backfill_jobs` table (source, cursor, total, fetched, state) and a `backfill-runner` agent that runs every 15 minutes while jobs are pending, then idles. Once caught up, agents drop back to their normal incremental schedule.
- Raise per-run page budgets (500–1000 records) with upsert-by-external-id so re-runs are idempotent.
- Add missing high-volume public sources:
  - **TED / EU tenders** (already scaffolded — expand to full archive; ~500k notices/yr)
  - **OCDS / Open Contracting** national portals (UK Contracts Finder, India CPPP, Ukraine Prozorro, Colombia SECOP)
  - **USASpending / FPDS** federal infrastructure awards
  - **UNGM**, **UN Procurement**, plus the remaining MDBs (IsDB, CAF, NDB, AIIB expansion)
  - **GEM** (Global Energy Monitor) trackers for power, LNG, steel, pipelines

### Phase 2 — Companies (15 → 40k)

- New `companies` table (name, normalized_name, country, type: contractor/developer/financier/consultant/supplier, website, registry ids, source urls, confidence) plus `company_project_roles` join table.
- **Company extraction agent**: every ingested project/tender/award already names borrowers, implementing agencies, winning bidders and consultants. Parse those party fields deterministically into companies at ingest time — this alone yields tens of thousands of organisations.
- **Normalization + dedup**: `pg_trgm` similarity on normalized names (strip Ltd/GmbH/S.A./JSC), country-scoped blocking, merge candidates surfaced in the existing review queue rather than auto-merged.
- Enrich the top-N companies (by project value) with website, HQ, sector focus via the existing research agents — not all 40k.

### Phase 3 — Contacts (7k → 66k)

- Extend `project_contacts` into an entity-level `contacts` table linked to companies and projects (role, email, phone, source url, verified_at).
- Harvest only from lawful public sources: tender notice contact points, MDB project task-team leads, agency staff directories, company "contact/leadership" pages, regulatory filings. No scraping of gated networks, no email guessing.
- Contact discovery agent runs per-company in batches, gated by the existing link validator so dead contacts decay in confidence over time.

### Cross-cutting

- **Quality gates stay on**: every record keeps `evidence_sources`; unverified records remain capped at 30% confidence and never auto-publish above the bar.
- **Cost control**: bulk ingest is pure HTTP + deterministic mapping (no LLM). AI is reserved for dedup adjudication, enrichment and summarisation.
- **Monitoring**: backfill progress (per source: fetched / total / ETA) surfaced as a new tab in the Agents Hub, with stall alerts through the existing `agent_health_alerts` pipeline.
- **Dashboard counters** switch to live totals so the marketing numbers track reality.

## Technical notes

- Reuse `_shared/pipelineIngest.ts` and `_shared/ingestCursor.ts`; backfill is an extension of the existing cursor, not a parallel path.
- All new public tables get GRANTs + RLS in the same migration; companies/contacts are readable by authenticated users, writable by service role only.
- Rate limiting per upstream host with exponential backoff; each source's terms of use recorded in `source_registry`.
- Edge Function CPU limits mean each run must checkpoint its cursor after every page, so an interrupted run resumes without data loss.

## Suggested order

1. `backfill_jobs` + runner + Agents Hub progress tab
2. World Bank / IFC / ADB / AfDB / EBRD / IADB / AIIB full backfill
3. `companies` + extraction + dedup
4. TED + OCDS + USASpending high-volume sources
5. `contacts` entity + harvesting agent
