# Data Sources — Catalogue & Integration Plan

InfraRadarAI tracks construction and infrastructure projects **from first signal to completion**. No single
source covers that lifecycle, so the platform layers source types. Each one answers a different question
a buyer asks:

| Lifecycle stage | Question the user asks | Source type |
|---|---|---|
| 1. Plan / pipeline | "What is being prepared that hasn't been tendered yet?" | MDB/DFI project pipelines, national infrastructure pipelines, aid activity (IATI) |
| 2. Procure | "What can I bid on, and when does it close?" | Procurement notices (MDB + national portals, OCDS feeds) |
| 3. Award | "Who won, at what price — who are my competitors?" | Contract award notices |
| 4. Build | "Is it on schedule? Any disputes, delays, cancellations?" | News (GDELT), regulators, satellite, company filings |
| 5. Operate / assets | "What already exists in this corridor/sector?" | Asset trackers (Global Energy Monitor, OpenStreetMap) |

Status was verified against the live endpoints on **2026-10-01** (HTTP status + response shape).

---

## A. Integrated (agents in `supabase/functions/`)

| Source | Agent | Stage | Coverage | Access |
|---|---|---|---|---|
| World Bank projects | `world-bank-ingest-agent` | Plan | Global, all borrowers | Free API |
| IFC, ADB, AfDB, AIIB, EBRD, IADB, EIB | `*-ingest-agent` | Plan | Regional MDB pipelines | Free APIs / pages |
| Global Energy Monitor | `gem-ingest-agent` | Plan → Operate | Power plants, pipelines worldwide | Free data |
| EU TED | `ted-ingest-agent` | Procure, Award | EU/EEA, CPV 45* works | Free API, no key |
| **World Bank procurement notices** *(new)* | `wb-procurement-ingest-agent` | Procure, Award | Every WB borrower, ~150 notices/day, ~28% civil works. Award winner + signed price parsed; linked to the parent project | Free API, no key |
| **UK Find a Tender** *(new)* | `uk-fts-ingest-agent` | Procure, Award | UK above-threshold, OCDS | Free API, no key (needs a User-Agent) |
| **South Africa eTender Portal** *(new)* | `za-etenders-ingest-agent` | Procure, Award | National, provincial, SOEs (Eskom, Transnet, SANRAL) | Free OCDS API, no key, slow (~15 s/page) |
| **GDELT news** *(new)* | `project-news-monitor` | Build | Global online news in ~65 languages, 15-min refresh. Searched by exact tracked-project name → evidence + event alerts | Free API, no key, tightly rate-limited |
| Web search/scrape | `_shared/scrapeRouter.ts` | All | Any public page | Firecrawl → Jina Reader → fetch; SearXNG search |

## B. Next to integrate (verified working, keyless)

Ranked by value to the ICP (emerging-market infra, EPC BD, DFIs, infra PE).

| # | Source | Why | Endpoint | Notes |
|---|---|---|---|---|
| 1 | **Brazil PNCP** (Portal Nacional de Contratações Públicas) | Largest LatAm market; all federal/state/municipal procurement since 2023 | `pncp.gov.br/api/consulta/v1/contratacoes/publicacao` | Filter by modality + "obras"; Portuguese → LLM translate titles |
| 2 | **Colombia SECOP II** | Full lifecycle incl. contracts and execution; 4G/5G road concessions | `datos.gov.co/resource/p6dx-8zbt.json` (Socrata SoQL) | Free; app token raises limits |
| 3 | **Ukraine Prozorro** | Reconstruction is one of the largest infra programmes of the decade | `public.api.openprocurement.org/api/2.5/tenders` | Feed of IDs, then per-tender fetch; CPV 45* filter |
| 4 | **Paraguay DNCP** | OCDS reference implementation; cheap to add via the OCDS helpers | `contrataciones.gov.py/datos/api/v3/doc` | Small market — do after the generic OCDS adapter |
| 5 | **USAspending.gov** | US federal construction awards (NAICS 23) — for US-facing EPC users | `api.usaspending.gov/api/v2/search/spending_by_award/` (POST) | Awards only, not pre-tender |
| 6 | **OpenStreetMap / Overpass** | `construction=*` and `proposed=*` tags locate sites; validates project coordinates | `overpass-api.de/api/interpreter` | Evidence/geo enrichment, not a project feed |

## C. Free, but needs a (free) API key — register, then set the secret

| Source | Why | Key |
|---|---|---|
| **IATI Datastore** | Every donor-funded activity (KfW, GIZ, FCDO, USAID, JICA…) with budgets, sectors, locations — the bilateral pipeline the MDB feeds miss. Sector codes 21xxx (transport), 23xxx (energy), 14xxx (water) | Free subscription key at developer.iatistandard.org → `IATI_API_KEY` |
| **SAM.gov opportunities** | US federal pre-tender notices | Free key at sam.gov → `SAM_API_KEY` |

## D. Blocked by bot protection — use Firecrawl (hosted plan with proxies)

These answered **403 "Just a moment…" (Cloudflare)** to plain requests. Firecrawl's hosted scraping, using
`firecrawlMap` to list notices and `firecrawlExtract` with a JSON schema for each notice, is the practical
route, and the best reason to pay for Firecrawl credits:

| Source | Value |
|---|---|
| AfDB procurement notices | Africa-wide works tenders — core ICP |
| ADB tenders (CSRN) | Asia-Pacific works tenders |
| OpenTender.eu | Cleaned EU procurement history with red-flag indicators |

Self-hosted Firecrawl does **not** include the proxy network, so expect it to fail on these too.

## E. Bulk datasets (periodic download, not live feeds)

| Dataset | Use |
|---|---|
| World Bank PPI Database | Private participation in infrastructure — sponsors, financial close, by country/sector. Benchmarks and investor lists |
| AidData Global Chinese Development Finance | Chinese-financed projects (Belt and Road) that MDB feeds miss entirely |
| Open Contracting Data Registry (data.open-contracting.org) | Index of 50+ published OCDS datasets; the shopping list for future national feeds |

## F. Open-source tooling

| Project | Licence | Role here |
|---|---|---|
| [Firecrawl](https://github.com/firecrawl/firecrawl) | AGPL-3.0 | Scrape / structured extract / map. Hosted or self-hosted (`FIRECRAWL_API_URL`) |
| [Jina Reader](https://github.com/jina-ai/reader) | Apache-2.0 | Keyless page → markdown fallback (in `openScrape.ts`) |
| [SearXNG](https://github.com/searxng/searxng) | AGPL-3.0 | Self-hosted metasearch fallback (`SEARXNG_URL`) |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | Apache-2.0 | Python crawler with LLM extraction. Alternative self-hosted engine if Firecrawl self-host is too heavy |
| [Kingfisher Collect](https://github.com/open-contracting/kingfisher-collect) | BSD-3 | Open Contracting Partnership's maintained scrapers for ~100 OCDS publishers. Run as a batch job to load many national feeds at once instead of hand-writing each |
| [GDELT](https://www.gdeltproject.org/) | Open data | Global news event stream |

## G. Commercial (benchmark only — what we are replacing)

MEED Projects, GlobalData Construction, BNamericas, IJGlobal, Dodge, Infralogic. Not integrated. Useful as
competitive benchmarks for coverage and as the price anchor in `go-to-market/MESSAGING.md`.

---

## Rules for adding a source

1. Write to `tender_events` (procurement/award) or stage via `_shared/pipelineIngest.ts` (projects). Never
   insert straight into `projects`.
2. Use `_shared/tenderIngest.ts`: `fetchFeedJson` (sets a User-Agent — several portals 403 Deno's default),
   `toUsd`, `sectorFromText`/`sectorFromCpv`, `regionForCountry` (returns null rather than guessing),
   and `insertNewTenderEvents` (dedupes on `source_url`).
3. Every row carries a source URL a user can click. No URL, no row.
4. Register in `agent_config` + cron via a migration using `public._agent_cron_auth_header()`, and add the
   agent to `src/lib/api/agents.ts` and `AgentMonitoring.tsx`.
5. Dry-run the parser against the live endpoint before shipping, and record coverage numbers in this file.
