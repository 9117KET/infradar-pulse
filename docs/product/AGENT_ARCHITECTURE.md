# Agent Architecture

InfraRadarAI uses backend agents to discover projects, enrich records, monitor risks and generate intelligence. Agents are controlled from the dashboard and record task status for operational visibility.

## MVP AI provider rule

For the MVP, all agent reasoning and extraction must use **Lovable AI** through shared backend utilities:

- `_shared/llm.ts` for chat completions and structured extraction.
- `_shared/webResearch.ts` for research-style narrative prompts.
- `_shared/agentResearch.ts` for source-aware research helper calls.

Agents must not require Perplexity, OpenAI or Firecrawl credits to complete. External providers may be added later as optional enrichment, but they must never be required for the baseline scheduled pipeline.

## Current agent families

## Discovery and ingest

- `research-agent`: broad infrastructure project discovery.
- `world-bank-ingest-agent`, `ifc-ingest-agent`, `adb-ingest-agent`, `afdb-ingest-agent`, `aiib-ingest-agent`, `ebrd-ingest-agent`, `iadb-ingest-agent`: MDB and DFI project ingestion.
- `source-ingest-agent`, `dataset-refresh-agent`: source and dataset refresh workflows.

## Enrichment and verification

- `data-enrichment`: fills missing project metadata.
- `contact-finder`: discovers source-backed contacts.
- `entity-dedup`: reduces duplicate project/entity records.
- `insight-sources-agent`: improves insight citations.

## Market and risk monitoring

- `tender-award-monitor`: tender, award, cancellation, re-tender and dispute signals.
- `funding-tracker`: development bank and project finance signals.
- `market-intel`: competitor, bid and award intelligence.
- `risk-scorer`: project risk analysis.
- `regulatory-monitor`: EIA, permit, sanctions and policy signals.
- `supply-chain-monitor`: commodity and logistics risks.
- `stakeholder-intel`: contractor, agency and governance risks.
- `sentiment-analyzer`: media sentiment and controversy detection.
- `security-resilience`: cyber, outage and critical infrastructure security events.
- `esg-social-monitor`: ESG, climate, litigation and social-license signals.
- `corporate-ma-monitor`: ownership, JV, M&A and counterparty changes.

## Reporting and user-facing AI

- `nl-search`: converts natural-language project search into safe structured filters.
- `portfolio-chat`: answers questions over a user’s tracked portfolio.
- `report-agent`, `digest-agent`, `executive-briefing`, `generate-insight`, `alert-intelligence`: produce reports, insights and alert analysis.

## Standard run flow

```text
Agent trigger
  -> auth/staff gate
  -> agent enabled/running gate
  -> gather project/database context
  -> Lovable AI research or extraction
  -> write projects, alerts, contacts, reports or updates
  -> update research_tasks
  -> update agent_config run status where supported
```

## Future external enrichment

External services can be reconsidered after customer traction shows where they add measurable value:

- Perplexity-style grounded web research for premium investigations.
- Firecrawl-style scraping for official portals that cannot be reached through stable APIs.
- Specialist datasets for procurement, sanctions, corporate ownership and commodity pricing.
- OpenAI or other model families only when a specific evaluation shows better accuracy for a defined task.

When added, these integrations should be optional, observable and easy to disable without breaking core agent runs.
