
# Mobile Responsive Refactor — InfraDar AI

Frontend-only initiative to make every page feel native-quality from 320px phones up to 1920px+ monitors. No backend, RLS, edge function, route, or business-logic changes. Brand identity (dark teal/cyan, glassmorphism, Playfair headings) preserved at every breakpoint.

## Current State (Audit Summary)

The app already has partial responsive groundwork:
- `useIsMobile()` hook (768px breakpoint) exists.
- Marketing `Navbar` already collapses to a `Sheet` below `md`.
- Shadcn `Sidebar` natively swaps to a mobile sheet via `useIsMobile`.
- Many pages use `grid md:grid-cols-*`, some use `ResponsiveContainer` for charts.

The gaps are concentrated in:
- `DashboardLayout` header (fixed-width search `w-56`, no mobile-tuned spacing, `main` always `p-6`, no safe-area padding, no bottom-tab bar).
- Data-dense dashboard pages (raw `<Table>` overflow, fixed Leaflet heights, kanban not stacking).
- Dialogs that should become drawers on mobile (ProjectEditor, UpgradeDialog, FeedbackWidget).
- Marketing hero/typography that uses fixed large text without lower-breakpoint variants.
- Forms with inputs <16px (causes iOS zoom-on-focus).

## Audit Snapshot

| Area | Status | Primary issues |
|---|---|---|
| `MarketingLayout` | ⚠️ partial | ConversionBar overlaps content on small viewports; no safe-area inset |
| `Navbar` (marketing) | ✅ good | Sheet exists; verify CTA reachability + 44px taps |
| `Footer` | ⚠️ partial | Multi-column collapses, but link spacing tight on 320px |
| `DashboardLayout` header | ❌ broken | Fixed `w-56` search, page title hidden, dense icons cramped <360px |
| `DashboardLayout` sidebar | ⚠️ partial | Shadcn handles mobile sheet, but no trigger placement on tiny screens |
| `Dashboard` `<main>` | ⚠️ partial | Fixed `p-6` everywhere; should be `p-3 sm:p-4 lg:p-6` |
| `home/HeroSection` + map | ⚠️ partial | Hero map height too tall on phones; copy text overflows at 320px |
| `home/PipelineSection`, `Capabilities`, `UseCase`, `Personas` | ⚠️ partial | Some grids skip `sm:` step (jump 1→3 cols) |
| `Pricing` | ⚠️ partial | 3-tier cards stack but pricing toggle clipped on 360px |
| `Login`, `Onboarding`, `auth/*` | ⚠️ partial | Cards use fixed widths; Onboarding stepper horizontal-scrolls |
| `dashboard/Overview` | ⚠️ partial | KPI grid OK, OverviewMap fixed height, charts not all responsive |
| `dashboard/Projects` | ❌ broken | Table overflows; filters bar wraps awkwardly |
| `dashboard/Alerts` | ❌ broken | Wide table; severity column truncates |
| `dashboard/ProjectDetail` | ❌ broken | Tabs row scrolls but content panels assume desktop columns |
| `dashboard/ProjectEditor` | ❌ broken | Dialog form too tall on phones; submit button off-screen |
| `dashboard/BDPipeline` | ❌ broken | Kanban columns horizontal-scroll without hint |
| `dashboard/AgentMonitoring`, `AnalyticsReports`, `Traction` | ⚠️ partial | Charts mostly responsive; some legends overflow |
| `dashboard/GeoIntelligence`, `CountryDetail` | ❌ broken | Map fills viewport but controls overlap on touch |
| `dashboard/Tenders`, `Users`, `SubscriberManagement`, `ReviewQueue`, `EvidenceVerification`, `FeedbackInbox`, `BillingAuditLog` | ❌ broken | Raw tables; need card fallback |
| `dashboard/Ask`, `PortfolioChat`, `Research`, `Reports`, `Digests`, `IntelligenceSummaries`, `InsightsManagement`, `Datasets`, `Pipeline`, `Portfolio`, `Compare`, `RealTimeMonitoring`, `RiskAnomalySignals`, `StakeholderIntel`, `TenderCalendar`, `Settings`, `Countries` | ⚠️ partial | Mostly card layouts; tighten padding, fix occasional fixed widths |
| Dialogs/Drawers | ⚠️ partial | `Dialog` used where `Drawer` would be better on mobile |
| Charts (Recharts) | ⚠️ partial | Most wrapped; tick density too high on phones |
| Leaflet maps | ❌ broken | Fixed heights; popups too wide; touch gestures not tuned |
| Tables | ❌ broken | No card fallback pattern |

## Prioritized Fix List

- **P0 — Unusable on mobile:** Projects table, Alerts table, ProjectDetail tabs, ProjectEditor dialog, BDPipeline kanban, Leaflet maps (Overview/Geo/Country), DashboardLayout header search.
- **P1 — High-traffic degraded:** Marketing Index/Hero, Pricing, Login, Onboarding, Dashboard Overview, ConversionBar overlap, Sidebar trigger placement.
- **P2 — Power-user surfaces:** AnalyticsReports, AgentMonitoring, Traction, Reports, Research, Ask, PortfolioChat, Stakeholder/Tender/Country pages.
- **P3 — Admin/staff:** Users, SubscriberManagement, ReviewQueue, EvidenceVerification, FeedbackInbox, BillingAuditLog, Datasets, InsightsManagement.

## Reusable Patterns To Introduce

1. `useBreakpoint()` hook — extends `use-mobile.tsx` to expose `sm/md/lg/xl/2xl` booleans + current key.
2. `<ResponsiveTable>` — wraps shadcn `Table`; below `md` renders a `<div>` of stacked cards using a `columns` config (label, value, primary?, hidden?).
3. `<MobileBottomNav>` — fixed bottom bar with 5 entries (Overview, Projects, Alerts, Ask, Settings). Visible only `< md`. Uses `env(safe-area-inset-bottom)`.
4. `<ResponsiveDialog>` — picks `Drawer` (vaul, full-height) on mobile, `Dialog` on desktop. Sticky footer slot for submit buttons.
5. `<ResponsiveChart>` — wraps `ResponsiveContainer`; auto-reduces `XAxis tick interval`, hides legend on `< sm`.
6. `<MapContainerResponsive>` — sets `h-[55vh] sm:h-[65vh] lg:h-[75vh]`, enables `tap`, disables `scrollWheelZoom` on touch, themes popups via existing CSS.
7. CSS utilities in `index.css`: `.safe-top`, `.safe-bottom`, `.safe-x` using `env(safe-area-inset-*)`; `.touch-target` (`min-h-11 min-w-11`); `.no-zoom` (`text-base` enforces 16px on inputs).
8. Container-query example on KPI cards (`@container` in Tailwind via `@tailwindcss/container-queries` already supported by Tailwind v3 arbitrary variants `[@container(min-width:...)]:`).

## Phased Rollout

### Phase 1 — Layouts + Navigation
- Add `useBreakpoint`, safe-area utilities, `.touch-target`, `.no-zoom` to `index.css`.
- `DashboardLayout`:
  - Header: collapse `ProjectSearch` to an icon-button that opens a full-width `Sheet` below `md`; show page title only `sm:` and up; tighten icon spacing.
  - `<main>`: `p-3 sm:p-4 lg:p-6` and `pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6` to clear bottom nav.
  - Add `<MobileBottomNav>` rendered only `< md`.
  - Move `SidebarTrigger` to a persistent position; ensure hamburger always reachable.
- `MarketingLayout`: add safe-area padding; ensure `ConversionBar` doesn't cover footer CTA on phones (slide-down on scroll already exists — verify).
- `Navbar`: audit Sheet contents for 44px taps; ensure CTA buttons stack full-width inside the sheet.
- `Footer`: tighten link grid to `grid-cols-2 sm:grid-cols-3 md:grid-cols-4`.
- `FeedbackWidget`: convert to `<Drawer>` on mobile.

### Phase 2 — Marketing + Auth
- `home/HeroSection` + `HeroMap` + `HeroLiveTracker`: responsive heading scale `text-4xl sm:text-5xl md:text-6xl lg:text-7xl`, fluid hero map height, stack CTA full-width on mobile.
- `home/*` sections: normalize grids to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; tighten section padding `py-12 md:py-20 lg:py-28`.
- `Pricing`: make billing-cycle toggle wrap; cards `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`; ensure Most-Popular ribbon fits 320px.
- `Login`, `Onboarding`, `auth/ForgotPassword`, `auth/ResetPassword`, `auth/AuthCallback`: cards `w-full max-w-md mx-auto`; inputs `text-base`; Onboarding stepper becomes vertical or compact dots `< sm`.
- `Index`, `About`, `Services`, `Contact`, `Careers`, `Press`, `Feedback`, `Privacy`, `Terms`, `Refund`, `DataProtection`, `Snapshot`, `Explore`, `Insights`, `InsightDetail`, `NotFound`, `Unsubscribe`: padding/typography pass.

### Phase 3 — Core Dashboard ✅
- `dashboard/Overview`: KPI grid already `grid-cols-2 sm:grid-cols-4` and split panels `lg:grid-cols-2` — verified responsive, no changes required.
- `dashboard/Projects`: TabsList horizontally scrolls on mobile; filter bar restructured to `grid-cols-1 sm:grid-cols-2 lg:flex` (search spans full width); table hidden below `md` and replaced with mobile card list (name, country/sector, badges, value, confidence bar); pagination unified outside view-mode wrapper.
- `dashboard/Alerts`: header buttons collapse to icon-only on mobile; TabsList and category filter pills horizontally scroll; alert cards use tighter `p-3 sm:p-5` padding.
- `dashboard/ProjectDetail`: 8-tab TabsList horizontally scrolls; project name uses `text-xl sm:text-2xl` with `break-words`/`min-w-0` to prevent overflow.
- New utility: `.scrollbar-none` added to `index.css` for hidden-scrollbar tab/filter strips.

### Phase 4 — Data-dense
- Tables → `<ResponsiveTable>` on: ReviewQueue, EvidenceVerification, Tenders, TenderCalendar, Users, SubscriberManagement, FeedbackInbox, BillingAuditLog, Datasets, InsightsManagement, Compare, StakeholderIntel.
- Charts → `<ResponsiveChart>` on: AnalyticsReports, AgentMonitoring, Traction, RiskAnomalySignals, RealTimeMonitoring.
- Maps → `<MapContainerResponsive>` on: GeoIntelligence, CountryDetail.
- BDPipeline kanban: snap-scroll columns with column-count indicator on mobile; long-press drag preserved for desktop only, with explicit "Move to…" tap menu on touch.
- `ProjectEditor`, `UpgradeDialog` → `<ResponsiveDialog>` with sticky footer.

### Phase 5 — Long-tail / admin
- Sweep remaining dashboard pages (Settings, Reports, Digests, IntelligenceSummaries, Pipeline, Portfolio, PortfolioChat, Ask, Research, Countries) for: fixed widths, missing `sm:` step in grids, raw tables, dialog/drawer choice.

### Phase 6 — Performance + a11y
- Lazy-load heavy routes via `React.lazy` (AgentMonitoring, AnalyticsReports, GeoIntelligence, BDPipeline, Compare, Traction).
- `loading="lazy"` + `decoding="async"` on non-critical images/illustrations.
- Wrap any large `framer-motion`/CSS animations in `prefers-reduced-motion` guards.
- ARIA labels on icon-only buttons (hamburger, bottom-tab items, search-icon-trigger).
- Visible focus rings using existing `--ring` token.
- Add `loading="lazy"` for Leaflet tiles (already lazy by Leaflet).
- Verify color contrast for `text-muted-foreground` on `--card` at small sizes.

## Testing Checklist

- DevTools viewports: 320, 360, 375, 390, 414, 480, 640, 768, 820, 1024, 1280, 1536, 1920.
- Touch emulation on for 320–820 widths.
- Real devices: iPhone SE (3rd gen), iPhone 15, Pixel 7, iPad Mini, iPad Pro.
- Browsers: Safari iOS 17+, Chrome Android, Chrome/Edge/Firefox/Safari desktop.
- Per page: no horizontal scroll, all CTAs reachable, all dialogs scrollable with footer visible, all tables readable, maps gesturable, charts legible.
- Lighthouse mobile pass per top-10 routes (target ≥ 85 perf, ≥ 95 a11y).
- Vitest unit tests for `useBreakpoint`, `<ResponsiveTable>`, `<ResponsiveDialog>`.

## Technical Notes

- Tailwind already configured; no new deps. Container-query support uses arbitrary variants `[@container(min-width:24rem)]:` plus `@container` class — no plugin install (graceful degrade if unsupported, just not applied).
- `vaul` `Drawer` already in shadcn (`src/components/ui/drawer.tsx`).
- Leaflet popup theme already in `index.css` — extend with mobile width clamp.
- Recharts `ResponsiveContainer` already in use; we'll standardize via `<ResponsiveChart>` wrapper.
- Sidebar mobile sheet is provided by shadcn — no replacement needed; only header trigger placement and bottom nav are added.
- `useIsMobile` (768px) is kept; `useBreakpoint` adds finer granularity without removing it.
- All new utilities use HSL semantic tokens; no hardcoded colors.

## Risks & Out-of-Scope

- Risk: Converting `Dialog`→`Drawer` may change focus-trap behavior; covered by `<ResponsiveDialog>` wrapper using existing Radix/vaul primitives.
- Risk: Mapping libraries differ in touch behavior; we'll keep Leaflet but tune `tap`, `tapTolerance`, `dragging` per breakpoint.
- Risk: Long-press drag in BDPipeline may regress on touch; mitigate with explicit "Move" menu.
- Out-of-scope: backend, RLS, edge functions, schema changes, new UI libraries, replacing Leaflet/Recharts, native wrapper (Capacitor/PWA installability — could be a future phase).
- Out-of-scope: full design overhaul; we keep current visual language intact.

## Estimated Effort

| Phase | Scope | Est. |
|---|---|---|
| 1 | Layouts + nav + utilities | 1 day |
| 2 | Marketing + auth | 1 day |
| 3 | Core dashboard 4 pages | 1 day |
| 4 | Tables/charts/maps/dialogs sweep | 2 days |
| 5 | Long-tail dashboard | 1 day |
| 6 | Perf + a11y + tests | 1 day |

Total: ~7 working days of agent time, executed phase-by-phase with verification between phases.

Approve this plan and Phase 1 will be executed first; subsequent phases will be confirmed before each kicks off.
