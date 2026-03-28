

# Expand Geographic Coverage to Global

## Problem
The entire platform — database schema, all 12 agents, frontend types, onboarding, settings, and project editor — is hardcoded to only 3 regions: MENA, East Africa, West Africa. The map shows the whole world but agents only discover projects in Africa/Middle East.

## Solution
Expand the `project_region` enum and all related code to cover all major world regions, and update every agent's search queries and prompts to be globally scoped.

## New Regions
Replace `'MENA' | 'East Africa' | 'West Africa'` with:
- **MENA** (keep existing)
- **East Africa** (keep existing)
- **West Africa** (keep existing)
- **Southern Africa**
- **Central Africa**
- **North America**
- **South America**
- **Europe**
- **Central Asia**
- **South Asia**
- **East Asia**
- **Southeast Asia**
- **Oceania**
- **Caribbean**

## Changes Required

### 1. Database Migration
- Add new values to `project_region` enum via `ALTER TYPE project_region ADD VALUE`

### 2. Frontend Types — `src/data/projects.ts`
- Expand `Region` type union and `REGIONS` array to include all new regions

### 3. Onboarding — `src/pages/Onboarding.tsx`
- Replace hardcoded 3-region list with full global regions list

### 4. Settings — `src/pages/dashboard/Settings.tsx`
- Default regions updated (or default to all); uses `REGIONS` from data file

### 5. Project Editor — `src/pages/dashboard/ProjectEditor.tsx`
- Already imports `REGIONS` from data file, no extra change needed

### 6. GeoIntelligence Map — `src/pages/dashboard/GeoIntelligence.tsx`
- Update default center from Africa-focused `[15, 35]` to world center `[20, 0]`, default zoom to 2

### 7. Edge Functions — ALL 12 agents + user-research (13 files total)

Each agent needs:
- **Search queries** expanded from "Africa MENA" to global terms
- **System prompts** changed from "MENA and Africa" to "global infrastructure projects worldwide"
- **Region enum** in extraction schemas expanded to include all new regions
- **research-agent**: Update `NEWS_SOURCES`, `RESEARCH_QUERIES`, `ExtractedProject.region` type, extraction prompt region list, and tool schema enum
- **user-research**: Update system prompt from "Africa and Middle East" to global
- **funding-tracker**: Update search queries from "Africa MENA" to global
- **market-intel**: Update search query and system prompt
- **stakeholder-intel**: Update system prompt
- **regulatory-monitor**: Update system prompt
- **sentiment-analyzer**: Update system prompt
- **supply-chain-monitor**: Update system prompt
- **alert-intelligence**: Update system prompt
- **data-enrichment**: Update prompts
- **contact-finder**: Update prompts
- **update-checker**: Update prompts
- **generate-insight**: Update system prompt
- **risk-scorer**: Update prompts

### 8. Home page components
- Any marketing copy referencing "MENA and Africa" exclusivity should be updated to "global" coverage

### 9. Insights seed data
- Update article titles/content that reference only MENA/Africa (cosmetic, lower priority)

## Key Design Decision
Users can still filter by specific regions in onboarding, settings, and the dashboard — so someone only interested in MENA still gets a focused experience. The agents just search globally by default instead of being restricted.

| Action | Files |
|--------|-------|
| SQL Migration | Add 11 new values to `project_region` enum |
| Modify | `src/data/projects.ts` — expand Region type + REGIONS array |
| Modify | `src/pages/Onboarding.tsx` — full region list |
| Modify | `src/pages/dashboard/Settings.tsx` — default regions |
| Modify | `src/pages/dashboard/GeoIntelligence.tsx` — global map center |
| Modify | 13 edge functions — global prompts, queries, schema enums |
| Modify | Home/marketing components — global messaging |

