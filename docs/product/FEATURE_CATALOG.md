# InfraRadarAI Feature Catalog

This catalog records the high-value platform features that are already implemented or clearly designed in the codebase. Use it when building future features, writing marketing documentation or deciding what to expose in a public docs area.

## Infrastructure project database

**Users:** BD teams, EPC contractors, consultants, investors, project managers.

**Value:** Centralizes global infrastructure opportunities with country, region, sector, stage, status, value, confidence, risk, description and source URLs.

**Current state:** Implemented through the `projects` table, dashboard project pages, filters, project detail pages and public exploration surfaces.

**Future ideas:** Add richer scoring, stage history, procurement timelines, comparable projects and account-level annotations.

## Global map and public exploration

**Users:** all commercial users, especially executives and new visitors.

**Value:** Makes global coverage visible immediately and lets users inspect project geography.

**Current state:** Public and dashboard map components use native Leaflet patterns for stable React 18 behavior.

**Future ideas:** Add saved geographic territories, heat maps, risk overlays and region-level pipeline comparisons.

## Natural-language project search

**Users:** BD teams, consultants, finance teams, project managers.

**Value:** Lets users ask questions like “power projects in West Africa above $100M entering tender” instead of manually combining filters.

**Current state:** Implemented with `/dashboard/ask` and the `nl-search` backend function using Lovable AI to translate prompts into structured project filters.

**Future ideas:** Saved natural-language searches, query suggestions, explainable ranking and alert creation from a query.

## Project detail, evidence and updates

**Users:** analysts, project managers, investors, consultants.

**Value:** Turns a project record into a decision page with source-backed details, risks, stakeholders, milestones and update history.

**Current state:** Project detail pages read from projects, evidence sources, milestones, stakeholders and update tables.

**Future ideas:** Stronger evidence scoring, source freshness warnings, side-by-side audit trails and document attachments.

## Portfolio and watchlist

**Users:** BD teams, EPCs, consultants, project managers, investors.

**Value:** Lets users save relevant projects, add notes and monitor their own pipeline rather than browsing the entire database repeatedly.

**Current state:** Implemented with `tracked_projects`, `useTrackedProjects` and the dashboard Portfolio page.

**Future ideas:** Shared portfolios, portfolio-level risk scoring, weighted pipeline value and CRM export.

## Portfolio chat

**Users:** investors, consultants, BD leads, project managers.

**Value:** Lets users ask AI questions about the projects they track, such as risk concentration, upcoming tenders or regional exposure.

**Current state:** Implemented as a dashboard chat surface backed by a portfolio chat function.

**Future ideas:** Streaming answers, citations, suggested next actions and saved chat insights.

## Tenders and awards

**Users:** EPC contractors, BD teams, consultants.

**Value:** Highlights tender openings, contract awards, re-tenders, cancellations and disputes, which are direct commercial triggers.

**Current state:** Implemented via Tenders pages and construction-category alerts, with a tender-award monitoring agent.

**Future ideas:** Dedicated `tender_events` table, close-date notifications, buyer profiles and bid/no-bid workflow.

## Alerts and alert rules

**Users:** all paying users.

**Value:** Keeps users informed when projects, markets, risks or tenders change.

**Current state:** Alerts table, dashboard alerts page and user-specific alert rules are implemented.

**Future ideas:** Email delivery, Slack/Teams integrations, saved-search alerts and severity tuning per portfolio.

## Country intelligence

**Users:** consultants, investors, DFIs, BD teams.

**Value:** Aggregates country-level project count, sector mix, pipeline value and risk context.

**Current state:** Country list and country detail dashboard are implemented using project data.

**Future ideas:** Country sentiment, political risk, procurement climate, fiscal capacity and MDB funding overlays.

## Intelligence summaries and AI market report builder

**Users:** consultants, executives, BD leaders, finance teams.

**Value:** Converts live project, alert and source data into market briefs and decision-ready reports.

**Current state:** Intelligence summaries and report-agent flow are implemented for scoped reports.

**Future ideas:** Scheduled reports, user-facing report builder, branded exports, report collaboration and report subscriptions.

## Human-in-the-loop review queue

**Users:** researchers and admins.

**Value:** Protects data quality by requiring review of AI-discovered or low-confidence projects before they become trusted intelligence.

**Current state:** Review queue, verification log, role restrictions and evidence workflows are implemented.

**Future ideas:** Review SLAs, duplicate detection queues, reviewer assignment and source-quality scoring.

## Agent monitoring

**Users:** researchers and admins.

**Value:** Gives the team operational control over discovery, enrichment, risk and monitoring agents.

**Current state:** Agent config, run state, pause/resume and task tracking exist in the dashboard.

**Future ideas:** Schedule editor, per-agent diagnostics, run replay, cost visibility and coverage dashboards.

## Contact discovery and stakeholder intelligence

**Users:** BD teams, EPCs, consultants, project managers.

**Value:** Helps users identify owners, contractors, financiers, consultants and public agencies connected to projects.

**Current state:** Project contacts table, contact discovery agent and stakeholder intelligence agent are implemented.

**Future ideas:** Dedicated contact database, CRM sync, contact confidence, outreach status and relationship mapping.

## Billing, trial, onboarding and feedback

**Users:** all users and admins.

**Value:** Supports product-led adoption while preserving access control and commercial readiness.

**Current state:** Authentication, RBAC, onboarding, card-free 3-day trial, refund messaging, billing settings and feedback intake are implemented.

**Future ideas:** Team seats, workspace billing, trial success checklist and in-app lifecycle messaging.
