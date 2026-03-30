# MEED competitor research → InfraRadar roadmap notes

Purpose: capture competitor signals from MEED’s subscription pages and translate them into concrete, incremental product + data + AI implementations for InfraRadar.

Sources:
- MEED Business Review landing example (PDF download, October 2025 issue): `https://www.meed.com/october-2025-data-drives-regional-projects`
- MEED Digital subscription product page: `https://buy.meed.com/product/meed-digital-subscription-business-intelligence/`
- MEED Premium subscription product page: `https://buy.meed.com/product/meed-premium-subscription-1-year/`

---

## 1) What MEED is selling (observed from the pages)

### Digital subscription (baseline)
What they emphasize:
- Always-on intelligence stream: “every day… all significant events”
- Archive access: “365 days… (20-year archive!)”
- High volume + cadence:
  - “Over 40 exclusive articles every week”
  - “Over 80 selected tenders and contract announcements every week”
  - daily + weekly newsletters (many sector/country-specific)
- Mixed formats:
  - news, analysis, commentary
  - “MEED Business Review” magazine included
  - invitations to events + live webinars

### Premium subscription (upgrade)
Adds:
- “Premium datasets” (explicitly “five interactive datasets”)
- Monthly magazine (“12 magazines”)
- Monthly webinar (scheduled, 1 hour)
- Dedicated account manager/training/demos
- Additional users included

### Example content packaging signal
The Business Review landing page links a downloadable PDF for an issue and lists the internal sections and topics.
This hints at a *repeatable reporting pipeline* (monthly/weekly) with a consistent structure + “downloadable artifact”.

---

## 2) What we should implement in InfraRadar (mapped to MEED’s offer)

### A) Subscription packaging (plan tiers → capabilities)
We already have Stripe + entitlements hooks in the codebase, so the “MEED-like” packaging is mostly:
- entitlements + quotas
- team/user management for multi-seat plans
- premium data products (“datasets”)

Implement incrementally:
- **Tier definitions** (Starter/Pro/Enterprise) that map to:
  - AI runs/day (already in `requireAiEntitlementOrRespond`)
  - PDF exports/day (already incremented via `increment_usage_metric` in Research Hub)
  - # of tracked projects
  - # of saved contacts / exports (CSV/PDF)
  - team seats (Premium-style “additional users”)
  - dataset access flags (“premium datasets”)

### B) Newsletters / alerts (cadence beats raw content volume)
MEED sells “being informed first”. That’s mostly delivery + relevance, not just having data.

Implement:
- **Saved alert rules**: per region/sector/country/project stage/value threshold
- **Delivery channels**:
  - email digest (daily/weekly)
  - in-app digest (Dashboard)
  - webhook / Slack (enterprise)
- **Digest templates**:
  - “Daily Brief”
  - “Weekly Tenders”
  - “Country/sector brief”

Data model direction (YAGNI-safe):
- start with one `subscriptions/digests` table and generate digest content on a schedule

### C) Reports / “Business Review” equivalents (downloadable artifacts)
MEED’s PDF issue is a product artifact. InfraRadar already exports a PDF for user research results.

Extend:
- **Scheduled reports** (weekly/monthly):
  - “Market risk snapshot”
  - “Top new projects”
  - “At-risk watchlist”
  - “Tender awards this week”
- **Report builder**:
  - standard sections (like MEED’s consistent issue structure)
  - include citations + verification links (`source_url` / `evidence_sources`)

### D) Premium datasets (interactive, queryable data products)
MEED Premium explicitly sells “five interactive datasets”.

InfraRadar “dataset products” candidates (build one first):
- Projects dataset (filters + export + API)
- Tender awards dataset
- Corporate/M&A dataset
- Regulatory dataset
- Risk + sentiment time-series dataset

Start small:
- define one “Dataset view” UI with:
  - filters (region, sector, stage, date)
  - saved views
  - CSV export (entitlement gated)

### E) Account manager / training (premium success lever)
We don’t need humans at first; we can emulate “guided onboarding”:
- guided setup checklist
- sample saved searches + templates
- “first 7 days” email series

---

## 3) How MEED likely uses AI (inference; what’s plausible)

MEED’s pages don’t explicitly claim AI features, but a modern BI publisher typically uses AI internally for:
- **triage**: clustering incoming news/tenders and routing to editors/analysts
- **summarization**: turning long articles into briefings/newsletters
- **entity extraction**: projects, companies, countries, values, dates
- **dedup + linking**: match new items to existing project records
- **quality checks**: citation validation, fact consistency flags
- **personalization**: “for you” digests by sector/country/role

InfraRadar is already built closer to an “AI-first extraction + structured DB” system (agents that extract structured projects + citations) rather than “article publishing”.

---

## 4) Typical MEED subscriber user journey (what they do day-to-day)

Based on the offer (news + archive + tenders + newsletters + reports + datasets), a typical workflow looks like:
- **Onboarding**:
  - choose sectors/countries
  - subscribe to newsletters
  - set alerts / watchlists
- **Daily**:
  - read daily news
  - scan “what changed” + tender announcements
  - forward relevant items to internal stakeholders
- **Weekly**:
  - sector/country newsletter
  - shortlist opportunities
  - update CRM pipeline
- **Monthly/quarterly**:
  - read magazine/report (download PDF)
  - use datasets to support strategic planning
  - join webinars / ask questions

The key recurring job-to-be-done: “Tell me what matters *for my scope* and give me sources I can forward internally.”

---

## 5) Where InfraRadar is already better (and where we can be much better)

### Already better (relative to what’s shown on the MEED pages)
- **Structured data first**: we store projects as rows with fields (country/sector/stage/value/confidence) rather than only articles.
- **Citations as first-class**: `source_url` and `evidence_sources` enable verification and HITL review.
- **Workflow visibility**: Research Hub shows the pipeline steps (search → scrape → extract → enrich) and can save to review queue.
- **Automation-ready**: “agents” can run on schedule and write into the DB.

### Biggest “be more better” moves (highest ROI)
- **Personalization layer**:
  - saved filters + alerts + digests
  - “for you” feed and weekly brief (like newsletters but tailored)
- **Trust layer**:
  - show evidence for each field (value/date/stage)
  - confidence scoring + explainers
  - dedup + entity resolution to reduce noise
- **Data products**:
  - a real “datasets” tab (interactive tables + exports)
- **Collaboration**:
  - team workspaces, shared watchlists, multi-seat
- **Distribution**:
  - email digest + Slack/webhook integrations

---

## 6) Concrete implementation backlog (minimal → premium)

### Phase 1 (boring + essential)
- Save searches (region/sector/country) + alerts
- Daily/weekly email digest (top deltas + new projects + links)
- Dataset UI v1: Projects table with filters + CSV export

### Phase 2 (premium differentiation)
- Dedup + entity resolution (project merge suggestions; “same project?”)
- Evidence-first UI (field-level citations)
- Scheduled “Business Review”-style reports (PDF) with sections + charts

### Phase 3 (enterprise)
- Team seats + roles
- Webhooks/Slack
- Account “training mode” (guided onboarding, templates)

---

## 7) Notes on constraints / risks
- MEED is a publisher; we’re an intelligence platform. Don’t copy “volume”; win on “signal + structure + verification”.
- Paid sources: some URLs will be paywalled. Your agent pipeline should handle:
  - paywall detection
  - degrade gracefully (store the URL, note limited extract)
  - prefer open/official sources when possible

