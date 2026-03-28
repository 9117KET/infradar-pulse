

# Sophisticated Dashboard Overview with Charts, Maps & Real-Time Visuals

## Summary

Rebuild the Overview page from a basic stats + table layout into a rich, data-dense command center with interactive charts, a mini heatmap, alert distribution visuals, and real-time agent activity — all powered by Recharts and the existing Leaflet map setup.

## Layout (6 sections)

```text
┌─────────────────────────────────────────────────────┐
│  KPI Cards (8 cards, 2 rows)                        │
├──────────────────────┬──────────────────────────────┤
│  Projects by Region  │  Projects by Sector          │
│  (Pie/Donut Chart)   │  (Bar Chart)                 │
├──────────────────────┴──────────────────────────────┤
│  Mini World Map — project locations heatmap          │
│  (Leaflet with circle markers, color = risk)         │
├──────────────────────┬──────────────────────────────┤
│  Confidence Trend    │  Alert Distribution           │
│  (Area Chart)        │  (Stacked Bar by category)    │
├──────────────────────┴──────────────────────────────┤
│  Pipeline by Stage   │  Agent Activity (live feed)   │
│  (Horizontal bar)    │  + Pending Review card        │
├─────────────────────────────────────────────────────┤
│  Recent Project Updates (table, kept from current)   │
└─────────────────────────────────────────────────────┘
```

## Changes

### 1. Install Recharts (already available via shadcn chart component)

Use the existing `recharts` dependency already in the project. Import `PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer` directly.

### 2. Rebuild `src/pages/dashboard/Overview.tsx`

**KPI cards (expanded to 8):** Projects tracked, Verified count, Avg confidence, Total value, Active alerts (unread), Stale projects (30d+), Pending review, Agent runs (24h).

**Projects by Region — Donut chart:** Aggregate `projects` by `region`, render as a donut with colored segments.

**Projects by Sector — Horizontal bar chart:** Aggregate by `sector`, show horizontal bars with values.

**Mini Heatmap Map:** Embed a small Leaflet map (reuse pattern from GeoIntelligence) with `CircleMarker` for each project. Color by risk score (green → amber → red). No popups, just visual density.

**Confidence Trend — Area chart:** Compute average confidence from `project_updates` over last 6 months (or use static fallback if insufficient data). Smooth area chart with gradient fill.

**Alert Distribution — Stacked bar chart:** Group alerts by category and severity. Show a bar per category with severity segments stacked.

**Pipeline by Stage — Horizontal bar:** Count projects per stage (Planned → Construction → Completed). Color-coded bars.

**Agent Activity + Pending Review:** Keep existing live feed but make it more compact. Keep pending review card.

**Recent updates table:** Keep but style more compactly.

### 3. Real-time subscriptions

Already has realtime for `research_tasks` and `projects`. Add subscription for `alerts` table to keep alert stats live.

### 4. Mini map component

Create `src/components/dashboard/OverviewMap.tsx` — a small, non-interactive Leaflet map (zoom/pan disabled or minimal) showing project dots colored by risk. Reuse the native Leaflet approach from GeoIntelligence to avoid React-Leaflet context issues.

## Files Changed

| Action | File |
|--------|------|
| Create | `src/components/dashboard/OverviewMap.tsx` — mini heatmap map |
| Rewrite | `src/pages/dashboard/Overview.tsx` — full rebuild with charts |

## Technical Notes

- Recharts is already a dependency (used by shadcn chart component)
- Leaflet is already installed and configured
- All data comes from existing hooks (`useProjects`, `useAlerts`) + existing Supabase queries
- No new database tables or migrations needed
- Real-time updates flow automatically through existing subscriptions

