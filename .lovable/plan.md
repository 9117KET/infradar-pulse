## Plan: document the platform vision and fix the remaining agent AI dependencies

### What I verified first

I scanned the codebase for external AI/search usage and confirmed the concern is valid. The shared AI wrapper now points to Lovable AI, but several agents still contain direct Perplexity and Firecrawl quota dependencies.

Remaining direct Perplexity usage found in:

- `contact-finder`
- `user-research`
- `aiib-ingest-agent`
- `ebrd-ingest-agent`

Remaining Perplexity wrapper dependency found in:

- `tender-award-monitor`
- `supply-chain-monitor`
- `stakeholder-intel`
- `security-resilience`
- `regulatory-monitor`
- `corporate-ma-monitor`
- `esg-social-monitor`

Remaining Firecrawl-required or Firecrawl-first paths found in:

- `afdb-ingest-agent`
- `aiib-ingest-agent`
- `ebrd-ingest-agent`
- `research-agent`
- `user-research`
- `contact-finder`
- `market-intel`
- `funding-tracker`
- `sentiment-analyzer`
- shared `_shared/perplexity.ts` fallback

The most serious failure risks are:

1. Some agents fail or return no work when external credits are gone.
2. Some ingest agents require `FIRECRAWL_API_KEY` before they can run.
3. The documentation still says `_shared/llm.ts` uses old external OpenAI-style environment variables, which is now outdated.

### Implementation scope

#### 1. Add durable product documentation to the codebase

Create a dedicated documentation area for future builders and for future public documentation pages, likely under `docs/product/`:

- `docs/product/PLATFORM_VISION.md`
  - Who InfraRadarAI serves: BD teams, EPC contractors, project managers, consultants, developers, investors, DFIs, lenders, public-sector teams and researchers.
  - The platform promise: verified global infrastructure intelligence, opportunity discovery, risk monitoring, and portfolio workflows.
  - The difference between implemented core features and future roadmap features.
- `docs/product/FEATURE_CATALOG.md`
  - Detailed descriptions of the already implemented high-value features:
    - Infrastructure project database
    - Global map and public exploration
    - Natural-language project search
    - Project detail pages with evidence and updates
    - Portfolio/watchlist
    - Portfolio chat
    - Tenders and awards
    - Alerts and alert rules
    - Country intelligence
    - Intelligence summaries and report builder
    - Human-in-the-loop review queue
    - Agent monitoring
    - Contact discovery
    - Billing, trial and onboarding
  - For each feature: user value, target users, current implementation state, future enhancement ideas.
- `docs/product/USER_GUIDE.md`
  - Practical “how to use the platform” guidance for non-technical users:
    - How to find projects
    - How to evaluate a project
    - How to build a portfolio
    - How to use alerts
    - How to use AI search and reports
    - How internal researchers verify projects
- `docs/product/AGENT_ARCHITECTURE.md`
  - Current agent suite and purpose.
  - The rule that MVP agents must use Lovable AI first and must not depend on Perplexity/OpenAI credits.
  - Future extension section explaining that external tools like Perplexity/OpenAI/Firecrawl can be added later as optional enrichment, not required runtime dependencies.

Also update:

- `FEATURES.md` to link to these new docs.
- `README.md` to explain where product vision, feature docs, roadmap and agent architecture live.
- `CLAUDE.md` to correct the outdated `_shared/llm.ts` description so future agents use Lovable AI by default.

#### 2. Standardize agent research on Lovable AI for the MVP

Refactor the remaining agents so external AI quotas do not block agent execution.

The MVP rule will be:

- Primary reasoning and research narrative: Lovable AI via `_shared/llm.ts` / `_shared/webResearch.ts`.
- No direct calls to `api.perplexity.ai`.
- No direct calls to `api.openai.com`.
- Firecrawl may remain only as optional future enrichment where useful, but agents must continue without it.
- Agents should degrade gracefully and record a useful `research_tasks.error` or `result.message`, not silently produce nothing.

Specific changes:

- Replace direct Perplexity calls in `contact-finder`, `user-research`, `aiib-ingest-agent`, and `ebrd-ingest-agent` with Lovable AI prompts.
- Remove `PERPLEXITY_API_KEY` reads from agent files where it is now only passed into the wrapper.
- Rename or adapt `_shared/perplexity.ts` so it no longer implies a Perplexity dependency. Either:
  - keep a compatibility export for existing imports but document it as a Lovable AI-backed research helper, or
  - introduce `_shared/agentResearch.ts` and migrate imports cleanly.
- Update Firecrawl-required ingest agents so missing Firecrawl does not immediately fail. Instead, use Lovable AI to produce an MVP research corpus from official source URLs, DB context and known MDB/project prompts.

#### 3. Improve agent reliability and observability

Add small reliability improvements while making the migration:

- Ensure each affected agent calls `finishAgentRun` consistently on completed and failed paths where that pattern is already used.
- Make failure messages explicit, for example: `Lovable AI research returned no content`, rather than `No research text`.
- Surface AI gateway failures from `_shared/webResearch.ts` clearly, including 402 and 429 cases, so it is obvious whether the problem is Lovable AI credits/rate limits rather than Perplexity.

#### 4. Deployment and verification after approval

After implementation, I will:

- Re-run a code scan to confirm there are no remaining direct `api.perplexity.ai`, `OPENAI_API_KEY`, direct `api.openai.com`, or required `PERPLEXITY_API_KEY` paths in the agent suite.
- Deploy the affected backend functions.
- Pull recent function logs for the most important agents after deployment.
- Report exactly what changed, which functions were deployed, and what remains intentionally optional for later.

### Technical notes

The intended final flow is:

```text
Agent trigger
  -> staff/auth gate
  -> agent enabled/running gate
  -> gather DB/project context
  -> Lovable AI research/extraction
  -> write projects, alerts, contacts or reports
  -> update research_tasks
  -> update agent_config run status
```

External tools later:

```text
Optional enrichment layer
  -> Perplexity / Firecrawl / OpenAI / other connectors
  -> only when customer traction justifies it
  -> never required for MVP agent completion
```

No database schema changes are expected for this pass. This is documentation plus backend function refactoring and deployment.

&nbsp;

Also use any lovable connectors as you deem necessary thst will achieve our works, when I started building this platform from scratch lovable automatically connected these connectors like fireclaw which was used in searching and scraping lots of date, we should continue similarly but making sure it serves the purpose of the platform for this first version and this can be improved in the future with external services 