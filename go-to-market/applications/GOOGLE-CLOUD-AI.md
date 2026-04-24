# Google Cloud for Startups - AI Startup Program Application

**Deadline:** Rolling - apply immediately
**Apply at:** https://cloud.google.com/startup/ai
**Offer:** Up to $350,000 in Google Cloud credits ($250K Year 1 + $100K Year 2) + $12,000 Enhanced Support + Vertex AI + Gemini API access
**Equity:** 0% - completely free

---

## Eligibility Note

Google Cloud AI Tier requires one of:
- Raised seed funding or above, OR
- Acceptance into a recognized accelerator program

**Action:** Apply to Techstars Anywhere or LAUNCH first, then use that acceptance to qualify for Google Cloud AI Tier. Alternatively, check if the standard Google Cloud for Startups tier (lower credits) has looser eligibility for pre-seed companies - it often does.

Also consider applying via the Entrepreneur First or a16z Speedrun pathway if accepted.

---

## Application Form Fields

Apply at: cloud.google.com/startup/ai > "Apply now"

### Company name
InfraRadar Pulse

### Website
[Your live URL]

### Company description
InfraRadar is an AI-native infrastructure intelligence platform. We aggregate real-time project data from 5 multilateral development banks (World Bank, IFC, ADB, AfDB, EBRD) using 40+ AI agents and deliver personalized alerts, research, and intelligence to infrastructure investors, EPC contractors, and project finance teams at $199/month - replacing analyst reports costing $3,000-$200,000/year.

### Industry
Enterprise Software, Financial Data, Artificial Intelligence

### How does AI power your product?

AI is the core architecture of InfraRadar, not a feature layered on top:

1. **Document extraction (LLM):** GPT-4o-mini extracts structured data from unstructured MDB project documents - pulling project value, sector, location, financing structure, milestone dates, and stakeholder contacts from PDFs and HTML pages across 5 MDB portals daily

2. **Risk scoring (LLM + rules):** 40+ agents score each project across 9 risk categories (Political, Financial, Regulatory, Supply Chain, Environmental, Construction, Stakeholder, Market, Security), generating a composite 0-100 risk score and confidence score per project

3. **Real-time monitoring (agents):** Continuous monitoring agents watch for signal changes - political events, regulatory filings, environmental approvals, financial close announcements - and generate alerts ranked by severity (Critical/High/Medium/Low)

4. **AI research agent (LLM + search + scraping):** On-demand multi-step research agent answers natural language queries ("find all hydropower projects above $100M in East Africa in financing stage") using Perplexity for web search and Firecrawl for deep scraping

5. **Intelligence generation (LLM):** AI generates intelligence briefs every 4 hours, synthesizing all signal patterns into executive-ready narratives; custom reports on demand

6. **Natural language search (LLM):** Converts natural language queries into structured database filters, making the project database queryable without technical knowledge

### What Google Cloud products do you plan to use?

**Immediate:**
- **Vertex AI:** Migrate AI agent inference from OpenAI direct to Vertex AI (Gemini 1.5 Flash for high-volume extraction, Gemini 1.5 Pro for research agent). The cost reduction vs. OpenAI direct is significant at our agent volume.
- **Cloud Run:** Migrate Supabase Edge Functions to Cloud Run for better cold-start performance and cost at scale
- **BigQuery:** Replace current Supabase Postgres analytics queries with BigQuery for cross-project, cross-region aggregations (our project database grows daily and analytics queries are becoming expensive)
- **Cloud Storage:** Document archive for MDB project PDFs, environmental assessments, and evidence documents

**Medium-term:**
- **Vertex AI Vision:** Satellite imagery analysis for construction verification (ESA Sentinel-2 integration)
- **Document AI:** OCR and extraction from scanned MDB documents (many AfDB and regional MDB documents are scanned PDFs)
- **Google Maps Platform:** Geospatial enrichment for project location data

### Current cloud infrastructure
- Frontend: Vercel (React/TypeScript)
- Backend/DB: Supabase (Postgres + Edge Functions on Deno)
- AI: OpenAI API, Perplexity API, Firecrawl

### What is your AI startup's stage?
Pre-revenue. Platform is live and deployed. Seeking first enterprise pilots.

### Funding raised
None (bootstrapped)

### Team size
2

---

## After Approval: Migration Priority

1. **Activate credits** and create Google Cloud project
2. **Migrate AI inference to Vertex AI Gemini** - replace OpenAI direct API calls in edge functions with Gemini 1.5 Flash for high-volume agents (scoring, extraction) and Gemini 1.5 Pro for research agent
3. **Set up BigQuery** for analytics queries - migrate dashboard aggregation from Postgres to BigQuery
4. **Set up Cloud Storage** for document archive
5. **Apply for Google Maps Platform credits** via Founders Hub for geospatial features
6. **Request introduction** to Google's enterprise infrastructure customers via the AI startup team
