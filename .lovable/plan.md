

# Dashboard Navigation Reorganization & Page Consolidation

## Current Problem

16 flat nav items with no grouping — overwhelming and hard to navigate. Several pages overlap in purpose.

## Merges

### 1. Satellite + Validation → **"Evidence & Verification"**
Both pull from `evidence_sources` table. Satellite shows satellite-specific evidence; Validation shows cross-source coverage. Merge into one page with tabs or sections.

### 2. Analytics + Reporting → **"Analytics & Reports"**
Analytics shows basic sector bar charts. Reporting shows a project table with CSV export and AI report generation. Merge into one page — charts on top, export/report tools below.

## New Sidebar Structure (Grouped with Section Labels)

```text
── CORE
   Overview
   Projects

── INTELLIGENCE
   Geo Intelligence
   Evidence & Verification  (merged Satellite + Validation)
   Risk Signals

── OPERATIONS
   Monitoring
   Alerts
   Agents              (admin)
   Review Queue         (admin)

── ANALYSIS
   Analytics & Reports  (merged Analytics + Reporting)
   Insights

── ADMIN
   Waitlist             (admin)
   Users                (admin)
   Settings
```

**Result: 16 items → 12 items**, organized into 5 logical groups with clear section labels.

## Changes

### 1. Create merged Evidence & Verification page
- `src/pages/dashboard/EvidenceVerification.tsx`
- KPI cards: Total sources, Verified count, Satellite verified, 4+ source coverage, Conflicts
- Donut chart: Evidence by type distribution
- Bar chart: Verification rate per type
- Coverage heatmap grid (project × evidence type)
- Full project table with satellite status column, source badges, coverage bars, confidence
- Filters: evidence type, verification status, coverage level

### 2. Create merged Analytics & Reports page
- `src/pages/dashboard/AnalyticsReports.tsx`
- Top section: Recharts visualizations (sector breakdown donut, region bar, value distribution, confidence trend)
- Bottom section: Reporting tools — region filter, project summary table, CSV export button, AI report generation button
- Keeps all existing Reporting functionality intact

### 3. Update DashboardLayout sidebar
- Replace flat `ALL_NAV` array with grouped structure using multiple `SidebarGroup` sections
- Remove Satellite, Validation, Analytics, Reporting routes
- Add Evidence & Verification and Analytics & Reports routes

### 4. Update App.tsx routes
- Remove `/dashboard/satellite`, `/dashboard/validation`, `/dashboard/analytics`, `/dashboard/reporting`
- Add `/dashboard/evidence` and `/dashboard/analytics-reports`
- Add redirects from old paths to new ones for bookmarks

### 5. Delete old pages
- `SatelliteVerification.tsx`, `MultiSourceValidation.tsx` (merged into EvidenceVerification)
- Old `Analytics.tsx`, `Reporting.tsx` (merged into AnalyticsReports)

## Files Changed

| Action | File |
|--------|------|
| Create | `src/pages/dashboard/EvidenceVerification.tsx` |
| Create | `src/pages/dashboard/AnalyticsReports.tsx` |
| Modify | `src/layouts/DashboardLayout.tsx` — grouped sidebar |
| Modify | `src/App.tsx` — updated routes |
| Delete | `src/pages/dashboard/SatelliteVerification.tsx` |
| Delete | `src/pages/dashboard/MultiSourceValidation.tsx` |
| Delete | `src/pages/dashboard/Analytics.tsx` |
| Delete | `src/pages/dashboard/Reporting.tsx` |

