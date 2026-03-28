

# Interactive Guided Product Tour (Post-Onboarding)

## What changes

After the text-based onboarding completes and the user lands on the dashboard for the first time, an **interactive step-by-step tour** begins. It highlights actual UI elements (sidebar items, header controls, page sections) with a spotlight overlay, tooltip arrows, and descriptions — walking the user through each feature in context.

## Approach

### 1. Tour Engine Component — `src/components/GuidedTour.tsx`

A full-screen overlay system with:
- **Spotlight mask**: Dark overlay with a transparent cutout around the highlighted element (CSS `clip-path` or box-shadow trick)
- **Tooltip bubble**: Positioned next to the highlighted element with an arrow, containing the feature name, description, and Next/Skip buttons
- **Step counter**: "Step 3 of 12" progress indicator
- Element targeting via `data-tour="step-id"` attributes on existing UI elements

No external library needed — pure React + CSS.

### 2. Tour Steps Definition

Each step targets a `data-tour` attribute and includes a title, description, and preferred tooltip position:

| Step | Target | Title | Description |
|------|--------|-------|-------------|
| 1 | Sidebar logo | Welcome to your Dashboard | This is your command center for infrastructure intelligence |
| 2 | Overview nav | Overview Dashboard | Real-time KPIs, risk heatmaps, and portfolio metrics |
| 3 | Research nav | AI Research Hub | Type any query and watch AI agents research in real time |
| 4 | Projects nav | Project Intelligence | Browse detailed project profiles with verified data |
| 5 | Geo Intelligence nav | Geo Intelligence | Interactive maps showing project clusters and corridors |
| 6 | Evidence nav | Evidence & Verification | Multi-source evidence layers for each project |
| 7 | Risk nav | Risk & Anomaly Signals | AI-powered risk scoring and signal detection |
| 8 | Analytics nav | Analytics & Reports | Custom dashboards with exportable reports |
| 9 | Insights nav | Insights & Briefings | AI-generated intelligence briefings |
| 10 | Notification bell | Notifications | Real-time alerts for projects and risk changes |
| 11 | Profile menu | Your Profile | Access settings, manage your account, view your role |
| 12 | Search bar | Quick Search | Search projects, alerts, and insights from anywhere |

Steps for Operations (researcher+) and Admin sections are conditionally included based on user role.

### 3. Add `data-tour` attributes to DashboardLayout

Add `data-tour="overview"`, `data-tour="research"`, etc. to each sidebar nav item, the notification bell, profile menu, and search input. Minimal changes — just adding an attribute to existing elements.

### 4. Tour State Management

- Store `tour_completed: boolean` in the `profiles` table (new column via migration)
- On first dashboard load, if `profile.onboarded === true && profile.tour_completed !== true`, auto-start the tour
- "Skip tour" dismisses and marks complete
- Finishing all steps marks complete
- A "Restart Tour" option in Settings or Profile menu

### 5. Tour UX

```text
┌──────────────────────────────────────────────┐
│ ████████████████████████████████████████████  │
│ ██┌──────┐██████████████████████████████████  │
│ ██│ Logo │██████████████████████████████████  │
│ ██└──────┘██████████████████████████████████  │
│ ██┌──────────┐  ┌─────────────────────┐█████  │
│ ██│▶Overview │←─│ Overview Dashboard   │█████  │
│ ██│  (lit)   │  │ Real-time KPIs and  │█████  │
│ ██└──────────┘  │ risk heatmaps...    │█████  │
│ ██  Research ██ │ [Back] [Next 2/12]  │█████  │
│ ██  Projects ██ └─────────────────────┘█████  │
│ ██████████████████████████████████████████████ │
│ ████████████████████████████████████████████  │
└──────────────────────────────────────────────┘
```

- Highlighted element gets a glowing border + z-index lift
- Everything else dimmed with a semi-transparent overlay
- Tooltip has smooth transition animations between steps
- Arrow points from tooltip to the highlighted element

## Files

| Action | File |
|--------|------|
| Create | `src/components/GuidedTour.tsx` — tour overlay, spotlight, tooltip, step logic |
| SQL | Add `tour_completed boolean default false` to `profiles` table |
| Modify | `src/layouts/DashboardLayout.tsx` — add `data-tour` attributes to nav items, header elements; render `<GuidedTour />` when tour not completed |
| Modify | `src/contexts/AuthContext.tsx` — expose `tour_completed` from profile, add `completeTour()` method |
| Modify | `src/pages/dashboard/Settings.tsx` — add "Restart Tour" button |

