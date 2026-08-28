/**
 * Route catalog for the deterministic crawler (Layer A).
 *
 * Derived from src/App.tsx. Dynamic routes (:slug, :id, :token, :country) are
 * omitted here — they need a real record to resolve and are better covered by
 * the per-feature specs. Keep this list in sync when routes change in App.tsx.
 */

/** Public marketing + auth-entry pages reachable without a session. */
export const PUBLIC_ROUTES: string[] = [
  "/",
  "/ask-demo",
  "/snapshot",
  "/explore",
  "/insights",
  "/services",
  "/pricing",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/refund",
  "/data-protection",
  "/careers",
  "/press",
  "/feedback",
  "/login",
  "/auth/forgot-password",
];

/**
 * Dashboard routes a plain `user` can open. Feature-gated ones still render
 * (they show an upgrade gate rather than erroring), so we expect them to load
 * cleanly even on the free plan.
 */
export const USER_ROUTES: string[] = [
  "/dashboard",
  "/dashboard/ask",
  "/dashboard/projects",
  "/dashboard/alerts",
  "/dashboard/settings",
  "/dashboard/geo",
  "/dashboard/evidence",
  "/dashboard/portfolio",
  "/dashboard/billing/audit",
  // Feature-gated — should render the gate, not crash:
  "/dashboard/analytics-reports",
  "/dashboard/intelligence-summaries",
  "/dashboard/tenders",
  // Now redirects onto /dashboard/projects tabs. Kept so old links stay
  // covered by the crawl; see e2e/projects-tabs.spec.ts.
  "/dashboard/countries",
  "/dashboard/compare",
  "/dashboard/pipeline",
  "/dashboard/calendar",
  "/dashboard/chat",
  "/dashboard/stakeholders",
  "/dashboard/contractors",
];

/** Routes behind <RoleGuard> — reachable as staff (researcher/admin). */
export const STAFF_ROUTES: string[] = [
  "/dashboard/research",
  "/dashboard/datasets",
  "/dashboard/users",
  "/dashboard/review",
  // Now a redirect to /dashboard/review?tab=source-health. Kept in the crawl
  // so old links stay covered; see e2e/source-health-tab.spec.ts.
  "/dashboard/source-health",
  "/dashboard/subscribers",
  "/dashboard/insights",
  "/dashboard/agents",
  "/dashboard/agent-health",
  "/dashboard/traction",
  "/dashboard/bd-pipeline",
  "/dashboard/feedback",
];
