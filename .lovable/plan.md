## Plan: AI-powered market reports as MVP competitive advantage

Build a first version of “premium intelligence reports” that uses InfraRadar’s own live projects, alerts, updates, tenders, portfolio, and citations to generate structured market reports users can act on inside the platform, rather than buying static single reports.

### 1) Update product positioning and marketing copy

- Refresh pricing and homepage/services messaging to clearly position InfraRadarAI as:
  - subscription access to living infrastructure intelligence,
  - AI Q&A over projects/alerts/portfolio,
  - decision-ready reports at a fraction of single-report pricing.
- Keep competitor references category-based, not directly naming MEED in public copy.
- Add messaging around “from static $4k+ PDFs to living AI intelligence” where appropriate.

### 2) Upgrade the report generation workflow

- Extend `report-agent` from a generic weekly snapshot into a report builder with report templates such as:
  - Country Projects Market Report
  - Sector Pipeline Report
  - Tender & Awards Outlook
  - Portfolio Risk Brief
- Allow parameters like country, region, sector, stage, and time window.
- Generate structured reports with sections inspired by high-quality market reports, without copying competitor content:
  - Executive summary
  - Market/pipeline overview
  - Sector breakdown
  - Key projects and stakeholders
  - Tender / award outlook
  - Risk and alert signals
  - Opportunities and recommended actions
  - Data quality / confidence notes
  - Source citations

### 3) Use platform data, not generic AI text

- Feed the report agent with current InfraRadar data:
  - approved projects matching selected scope,
  - alerts and risk categories,
  - project updates/changelog entries,
  - recent insights,
  - tender/construction alerts where available,
  - source URLs and evidence links.
- Add aggregate statistics before calling AI so reports contain actual metrics: project count, total value, stage distribution, sector distribution, high-risk counts, critical alerts, and top projects.
- Keep source URLs and confidence scoring visible so reports are credible and auditable.

### 4) Improve the Intelligence Summaries / Reports UI

- Replace the basic “Generate Report” button with a small report generator panel:
  - report type selector,
  - country/region selector,
  - sector selector,
  - time window selector,
  - generate button.
- Show generated reports as polished cards with metadata: scope, status, generated date, project count/value where available, and source count.
- Render report content in readable markdown instead of raw preformatted text.
- Add a “view report” expanded layout with section headings, citations, and clear CTAs to inspect projects/alerts.

### 5) Improve PDF export quality for reports

- Replace plain text PDF output with a more premium branded layout:
  - InfraRadarAI title page/header,
  - report title, scope, generated date,
  - KPI summary block,
  - sectioned content,
  - citations appendix,
  - watermark / plan-based export rules already used elsewhere.
- Keep the current entitlement gating: PDF report downloads remain a paid/Pro value driver.
- Use a browser-side PDF generator for MVP so no new database schema is required immediately

### 6) Add roadmap notes for future report features

- Add/update roadmap documentation for post-MVP report capabilities:
  - scheduled monthly/country reports,
  - report library by country/sector,
  - white-label enterprise reports,
  - report sharing links,
  - deeper chart-heavy PDF generation,
  - analyst review/approval workflow before publishing public reports.

## Technical details

- Frontend files likely to update:
  - `src/pages/dashboard/IntelligenceSummaries.tsx`
  - `src/pages/dashboard/Reports.tsx` if still needed, or keep it aligned with the consolidated summaries route
  - `src/pages/Pricing.tsx`
  - homepage/service copy components such as `HeroSection`, `ProblemSection`, `CapabilitiesSection`, and `Services`
  - possibly `src/lib/api/agents.ts` to pass new report parameters
- Backend function to update:
  - `supabase/functions/report-agent/index.ts`
- No database migration is required for the MVP because `report_runs.parameters`, `markdown`, and `citations` already support this. If metadata needs to be stored separately later, that can be a future migration.
- Existing auth/security stays intact: report generation remains staff/researcher-controlled unless we intentionally open a user-facing report builder later behind entitlements.

## MVP acceptance criteria

- A researcher/admin can generate a scoped market report, e.g. “UAE projects market, 30 days” or “Energy pipeline in MENA”.
- The report uses real InfraRadar project/alert/update data and includes citations when available.
- The UI makes reports feel like a premium intelligence product, not a raw AI note.
- Marketing/pricing copy communicates the advantage: users get living AI intelligence and report-quality outputs through subscription instead of paying thousands for one static PDF.
- Existing routes and consolidated navigation continue to work.