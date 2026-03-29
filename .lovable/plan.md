# Remove Contact Section + Role-Based Action Restrictions + Project Tracking

**Status (last reviewed):** Most items are implemented in-repo. Apply migration `20260329140000_project_attribution.sql` (or run `supabase db push`) so `created_by` / `research_saved_by` exist in your database.

## 1. Remove Contact Section — **Done**

The `ContactSection` component is removed. `src/pages/Contact.tsx` is a simple “Get in touch” page. `/contact` remains in `App.tsx`.

## 2. Role-Based Action Restrictions — **Done (with attribution columns)**

| Action | Implementation |
|--------|----------------|
| Edit project | `canEditProject()` in `src/lib/project-permissions.ts`: admin/researcher for any project; other users only if `created_by` or `research_saved_by` matches them. |
| Delete project | `canDeleteProject()`: admin (all), researcher (only `created_by`), user (only `research_saved_by`). |
| Verify / evidence / contacts / milestones / contact finder | `canModerate` = researcher + admin only on `ProjectDetail.tsx`. |
| New Project | `Projects.tsx` + `ProjectEditor` redirect if not researcher/admin. |
| Insights generate / publish / delete | `InsightsManagement.tsx`: generate + publish = researcher+admin; delete = admin. |
| Settings | Preferences + notifications for all; Agents tab for researcher+admin. |
| Export CSV | Unchanged (all roles). |
| Run agents | Settings agents + `/dashboard/agents` guarded; Research page available for research workflows. |

## 3. Project Tracking — **Done**

- Table `tracked_projects` + hook `use-tracked-projects.ts`.
- Track toggle on `ProjectDetail` + `Projects` table.
- Overview “Your tracked projects” section.
- **Research → save:** sets `research_saved_by`, inserts `tracked_projects`, invalidates tracked query.
- **Projects list:** “Tracked only” filter.
- **Notes on bookmarks:** column exists on `tracked_projects`; UI for editing notes not built (optional follow-up).

## Files Summary

| Item | Status |
|------|--------|
| Delete `ContactSection.tsx` | Removed |
| `Contact.tsx` | Simple support page |
| `tracked_projects` + RLS | Migration present |
| `use-tracked-projects.ts` | Done |
| `ProjectDetail.tsx` | Permissions + track + moderate vs edit |
| `Projects.tsx` | New Project guard + track icons + **Tracked only** filter |
| `Overview.tsx` | Tracked section |
| `InsightsManagement.tsx` | Role guards + empty-state copy |
| `Settings.tsx` | Tab visibility by role |
| `App.tsx` | Settings without RoleGuard (content filtered inside) |
| `project-permissions.ts` + migration `project_attribution` | **New** — run migration |
