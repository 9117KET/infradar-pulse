# Google Cloud for Startups — AI Startup Program Application

**Deadline:** Rolling — apply immediately
**Apply at:** https://cloud.google.com/startup/ai
**Offer:** Up to $350,000 in GCP credits ($250K Yr 1 + $100K Yr 2) + $12,000 Enhanced Support + Vertex AI + Gemini API access
**Equity:** 0%

---

## Eligibility Note

The AI Tier typically requires either prior seed funding **or** acceptance into a recognized accelerator. Apply to Techstars Anywhere, EF, or a16z Speedrun first if needed; the standard Google Cloud for Startups tier (lower credits) often accepts pre-seed companies directly.

---

## Application Form Fields

Apply at cloud.google.com/startup/ai → "Apply now".

### Company name
InfraRadarAI

### Website
https://infradarai.com

### Company description
InfraRadarAI is the AI-native, verified replacement for $5K–$200K/year infrastructure intelligence reports. 30+ agents continuously ingest 7 multilateral development banks (World Bank, IFC, ADB, AfDB, EBRD, AIIB, IADB) and 20+ procurement portals; every record is source-linked, with unverified data capped at 30% confidence and routed through a human review queue. Plans from $29/month. Live at infradarai.com.

### Industry
Enterprise Software, Financial Data, AI

### How does AI power your product?

AI is the architecture, not a feature:

1. **Document extraction (LLM).** Gemini-class models extract structured data from unstructured MDB project documents — value, sector, location, financing, milestones, stakeholder contacts — across 7 MDB portals daily.

2. **Risk scoring (LLM + rules).** 30+ agents score each project across 9 risk categories (Political, Financial, Regulatory, Supply Chain, Environmental, Construction, Stakeholder, Market, Security) into a composite 0–100 score with confidence.

3. **Real-time monitoring.** Continuous agents watch for political, regulatory, environmental, financial and contractor signals; alerts are classified and ranked Critical/High/Medium/Low with 30-day trend analytics.

4. **Verified-intelligence pipeline.** Every record carries a source URL; unverified data capped at 30% confidence; mandatory human-in-the-loop review with audit reasons.

5. **AI Market Report Builder.** Country / sector / tender / portfolio reports generated on demand, citing source-linked evidence.

6. **Ask in plain English + portfolio chat.** NL queries translated into safe filtered searches over the project graph (live).

7. **Satellite verification.** Sentinel-2 imagery cross-checked against reported construction progress (live).

### What Google Cloud products do you plan to use?

**Immediate**
- **Vertex AI / Gemini.** Add Gemini via Vertex as a redundant inference path alongside the Lovable AI gateway, primarily for enterprise customers needing Google-region data residency.
- **Cloud Run.** Optional migration target for Edge Functions where Cold-start matters.
- **BigQuery.** Cross-project, cross-region analytics — daily-growing project graph; current Postgres analytics queries are becoming expensive.
- **Cloud Storage.** Evidence archive (PADs, EIAs, feasibility studies).

**Medium-term**
- **Vertex AI Vision / Earth Engine.** Satellite verification scaling beyond pilot.
- **Document AI.** OCR + extraction from scanned regional MDB PDFs (AfDB, IADB).
- **Google Maps Platform.** Enterprise geospatial fallback.

### Current cloud infrastructure
- Frontend: Vercel (React / TypeScript)
- Backend / DB: Supabase (Postgres + Edge Functions on Deno)
- AI: Lovable AI gateway (Gemini 3 / GPT-5 class) — no required external LLM spend for MVP agents.

### What is your AI startup's stage?
Live platform; paid plans live via Paddle `[VERIFY paid conversion count before submission]`.

### Funding raised
None — bootstrapped.

### Team size
2

---

## After Approval — Migration Priority

1. Activate credits; create GCP project.
2. Stand up Vertex AI / Gemini as a redundant inference path for enterprise data-residency needs.
3. Stand up BigQuery for cross-project analytics.
4. Stand up Cloud Storage evidence archive.
5. Apply for Google Maps Platform credits via Founders Hub.
6. Request intro to Google's enterprise infrastructure customers via the AI startup team.
