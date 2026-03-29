# Remove Contact Section + Role-Based Action Restrictions + Project Tracking

## 1. Remove Contact Section

The `ContactSection` component (old waitlist form) is still used on the `/contact` route. It inserts into the `waitlist` table which is deprecated.

- **Delete** `src/components/home/ContactSection.tsx`
- **Modify** `src/pages/Contact.tsx` — replace with a simple "Get in touch" page pointing to the Engagement Section options or a basic contact info page
- **Modify** `src/App.tsx` — optionally keep `/contact` route with updated content

## 2. Role-Based Action Restrictions

Currently, many admin/researcher actions are visible and functional for regular users:


| Action                    | Current | Should Be                                                                                                                               |
| ------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Edit project              | Anyone  | Researcher + Admin + (Users only when it is a project they have conducted research on)                                                  |
| Delete project            | Anyone  | Admin for all projects + Researchers with only the projects they have creted + Users with only the projects they have done research on. |
| Mark Verified/Unverified  | Anyone  | Researcher + Admin                                                                                                                      |
| Add Evidence              | Anyone  | Researcher + Admin                                                                                                                      |
| Add Contact               | Anyone  | Researcher + Admin                                                                                                                      |
| New Project button        | Anyone  | Researcher + Admin                                                                                                                      |
| Generate Insight          | Anyone  | Researcher + Admin                                                                                                                      |
| Publish/Unpublish Insight | Anyone  | Admin only                                                                                                                              |
| Delete Insight            | Anyone  | Admin only                                                                                                                              |
| Export CSV                | Anyone  | All (keep)                                                                                                                              |
| Run agent functions       | Anyone  | Researcher + Admin + users(with rate limites and only when doing research)                                                              |


**Implementation**: Use the existing `useAuth().hasRole()` throughout:

- `**src/pages/dashboard/ProjectDetail.tsx**` — conditionally render Edit/Delete/Verify/Add Evidence/Add Contact buttons
- `**src/pages/dashboard/Projects.tsx**` — hide "New Project" button for regular users
- `**src/pages/dashboard/InsightsManagement.tsx**` — hide Generate/Publish/Delete for users; show read-only view
- `**src/pages/dashboard/Settings.tsx**` — already admin-guarded via RoleGuard; also make the Settings route accessible to all roles but show only user-relevant tabs (Profile, Preferences) for non-admins. Agent controls remain admin/researcher only.

## 3. Project Tracking (Watchlist)

Users need the ability to **track/bookmark projects** they're interested in and see them on their dashboard.

### Database

- **New table**: `tracked_projects`
  - `id` (uuid, PK)
  - `user_id` (uuid, NOT NULL, references auth.users on delete cascade)
  - `project_id` (uuid, NOT NULL)
  - `created_at` (timestamptz, default now())
  - `notes` (text, default '')
  - UNIQUE(user_id, project_id)
  - RLS: users can CRUD only their own rows

### Frontend

- `**src/hooks/use-tracked-projects.ts**` — hook to fetch, add, remove tracked projects for the current user
- `**src/pages/dashboard/ProjectDetail.tsx**` — add a "Track Project" / "Untrack" toggle button (star/bookmark icon) visible to all roles
- `**src/pages/dashboard/Projects.tsx**` — add a track/bookmark icon on each project row; add a "Tracked" filter option
- `**src/pages/dashboard/Overview.tsx**` — add a "Your Tracked Projects" section showing the user's bookmarked projects with quick-access cards
- **Research results** — when a user saves research results to review queue, auto-track those projects

### UX

- Bookmark icon (filled = tracked, outline = not tracked) on project cards and detail pages
- Dashboard overview shows a dedicated "Tracked Projects" panel with project name, status, last update
- Users can add personal notes to tracked projects

## Files Summary


| Action | File                                                                                         |
| ------ | -------------------------------------------------------------------------------------------- |
| Delete | `src/components/home/ContactSection.tsx`                                                     |
| Modify | `src/pages/Contact.tsx` — simple contact/support page                                        |
| SQL    | Create `tracked_projects` table with RLS                                                     |
| Create | `src/hooks/use-tracked-projects.ts`                                                          |
| Modify | `src/pages/dashboard/ProjectDetail.tsx` — role-guard actions + track button                  |
| Modify | `src/pages/dashboard/Projects.tsx` — role-guard New Project + track icons                    |
| Modify | `src/pages/dashboard/Overview.tsx` — tracked projects section                                |
| Modify | `src/pages/dashboard/InsightsManagement.tsx` — role-guard generate/publish/delete            |
| Modify | `src/pages/dashboard/Settings.tsx` — show user-accessible tabs for all roles                 |
| Modify | `src/App.tsx` — remove Settings RoleGuard (make accessible to all, content is role-filtered) |
