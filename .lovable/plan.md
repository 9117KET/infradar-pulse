

# Infradar — Infrastructure Intelligence Platform MVP

## Overview
A complete dark-themed, premium infrastructure intelligence platform for MENA and Africa, combining a marketing site with an interactive demo and a protected dashboard application.

## Brand & Design System
- **Dark theme** with teal/cyan primary accent throughout
- Glass panel aesthetics: semi-transparent backgrounds, white/10 borders, radial teal gradients
- Serif headlines (e.g., Playfair Display) + sans-serif body (Inter/system)
- Radar/target logo mark: concentric circles + crosshair in teal
- Sticky dark nav with glass effect, mobile sheet menu

## Marketing Site Pages

### Home Page (8 sections)
1. **Hero** — Two-column layout with headline, stats row, and "Verified feed" demo card showing 3 project rows (NEOM, Trans-Saharan Grid, East Africa Rail)
2. **Problem** — Three stat cards (85% delayed, $1.5T+ at risk, 6-12mo lag)
3. **Capabilities** — Bento grid with 6 modules (monitoring, satellite, validation, geospatial, risk, reporting)
4. **Interactive Demo** — Filterable map/globe with 8+ color-coded project pins, detail panels, aggregate stats strip. Filters: region, sector multi-select, status, value slider, confidence toggle
5. **Pipeline** — 4-step flow (Collection → Verification → Analysis → Intelligence) + feature grid
6. **Personas** — 4 role cards (Investors, Strategy, Project leads, Business dev)
7. **Use Case Spotlight** — Before/During/After/Impact flow with metric chips
8. **Contact/Waitlist** — Full form (email, name, company, role, interest, size, challenge) with trust badges

### Additional Pages
- **Insights** — 3 featured posts + stat band
- **Services** — Platform modules overview
- **Pricing** — No prices, tailored/pilot framing, CTAs to contact
- **About, Contact, Waitlist, Terms, Privacy, Data Protection, Careers, Press** — Professional minimal pages

## Interactive Demo (Home #demo section)
- Left filter panel: region, sector, status, value range, confidence threshold
- Center: Map with color-coded pins (8+ seeded projects across MENA/Africa)
- Click pin → project detail modal with confidence %, risk score, timeline, stakeholders
- Aggregate strip showing totals when region selected

## Dashboard Application (Protected)
- Mock auth gate (demo/demo credentials)
- Branded sidebar: "InfraRadar AI — Intelligence Platform"

### Dashboard Pages
- **Overview** — 4 KPI cards with sparklines, map preview, confidence trend, recent updates table
- **Projects** — Filter bar, search, Save Search (localStorage), Export CSV, full project table
- **Project Detail** — Summary, score badges, milestones, evidence list, stakeholder chips
- **Analytics** — Charts (sector mix, confidence over time)
- **Alerts** — Mock alert items with severity
- **Users & Settings** — Notification toggles, region preferences (localStorage)

## Data Layer
- Structured mock data: 8+ projects with id, name, country, region, sector, stage, value, confidence, lat/lng, stakeholders, milestones, evidence
- Form submissions stored via Supabase or localStorage
- CSV export from visible project table columns
- Saved filters in localStorage

## MVP Extras
- Loading skeletons and empty states
- Dedicated /waitlist page mirroring #contact form
- Focus states and aria labels on interactive elements
- Responsive design throughout

