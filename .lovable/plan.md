

# Human-in-the-Loop Research & Rich Project Management

## What We're Building

Three major enhancements to make the platform truly verification-driven with human oversight:

### 1. Researcher Role & Manual Project CRUD

Authenticated users can fully manage projects — create, edit, and delete — directly from the dashboard. The Review Queue already handles AI-discovered projects; this adds manual human entry and editing.

**New page: Project Editor** (`/dashboard/projects/new` and `/dashboard/projects/:id/edit`)
- Full form to create or edit a project with all fields: name, country, region, sector, stage, status, value, coordinates, description, timeline, confidence, risk score
- Inline management of stakeholders (add/remove chips)
- Inline management of milestones (add/remove/toggle complete)
- Delete project with confirmation dialog

**Database changes:**
- Add INSERT policy on `projects` for authenticated users
- Add INSERT/UPDATE/DELETE policies on `project_stakeholders`, `project_milestones`, `evidence_sources` for authenticated users

**Projects table update:**
- Add "New Project" button to Projects page
- Add Edit/Delete actions to ProjectDetail page

### 2. Evidence Sources with Real Links & Multi-Source Verification

Expand the evidence system so every project has clickable, verifiable source links.

**Database migration — expand `evidence_sources`:**
- Add `title` (text) — human-readable link title
- Add `description` (text) — brief note about what this source proves
- Add `added_by` (text, default 'ai') — tracks whether human or AI added it

**Evidence management on ProjectDetail:**
- "Add Source" button opens a form: source name, URL, type (Satellite/Filing/News/Registry/Partner), description
- Toggle verified status per source
- Delete sources
- All URLs render as clickable external links with proper labels

**Agents also store real URLs:**
- Existing agents already populate `evidence_sources.url` — ensure they store actual Firecrawl/Perplexity result URLs instead of `#`

### 3. Rich Project Descriptions & Analysis

Expand the project data model to support deeper analysis content.

**Database migration — expand `projects`:**
- Add `detailed_analysis` (text) — long-form analysis (market context, strategic significance)
- Add `key_risks` (text) — specific risk factors
- Add `funding_sources` (text) — funding breakdown
- Add `environmental_impact` (text) — EIA summary
- Add `political_context` (text) — regulatory/political landscape
- Add `source_url` (text) — primary official project website/page

**ProjectDetail page enhancements:**
- Tabbed layout: Overview | Analysis | Evidence | Timeline
- Overview: existing description + KPIs + stakeholders
- Analysis: detailed_analysis, key_risks, funding_sources, environmental_impact, political_context (rendered as sections, editable)
- Evidence: expanded evidence table with add/edit/delete + clickable links
- Timeline: milestones with add/edit capability
- "Official Project Link" button at the top linking to `source_url`

## Files Changed

| Action | File |
|--------|------|
| Create | `src/pages/dashboard/ProjectEditor.tsx` — full create/edit form |
| Modify | `src/pages/dashboard/ProjectDetail.tsx` — tabbed layout, edit/delete actions, evidence CRUD, analysis sections |
| Modify | `src/pages/dashboard/Projects.tsx` — add "New Project" button |
| Modify | `src/data/projects.ts` — extend Project interface with new fields |
| Modify | `src/hooks/use-projects.ts` — map new DB fields |
| Modify | `src/App.tsx` — add new/edit routes |
| Migration | Add columns to `projects`, add columns to `evidence_sources`, add RLS policies for CRUD |

## Technical Details

**Migration SQL (single migration):**
```sql
-- Expand projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS detailed_analysis text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_risks text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS funding_sources text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS environmental_impact text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS political_context text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_url text DEFAULT '';

-- Expand evidence_sources
ALTER TABLE evidence_sources ADD COLUMN IF NOT EXISTS title text DEFAULT '';
ALTER TABLE evidence_sources ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE evidence_sources ADD COLUMN IF NOT EXISTS added_by text DEFAULT 'ai';

-- Allow authenticated users full CRUD
CREATE POLICY "Auth users insert projects" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth insert stakeholders" ON project_stakeholders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update stakeholders" ON project_stakeholders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete stakeholders" ON project_stakeholders FOR DELETE TO authenticated USING (true);
CREATE POLICY "Auth insert milestones" ON project_milestones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update milestones" ON project_milestones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete milestones" ON project_milestones FOR DELETE TO authenticated USING (true);
CREATE POLICY "Auth insert evidence" ON evidence_sources FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update evidence" ON evidence_sources FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete evidence" ON evidence_sources FOR DELETE TO authenticated USING (true);
```

**Project Editor** uses react-hook-form with Supabase direct inserts/updates. Generates slug from name. On create, sets `ai_generated = false, approved = true`.

**ProjectDetail** uses a tabbed interface (existing Tabs component) with inline editing capability and real external links throughout.

