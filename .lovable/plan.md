

# Project Verification Status Toggle

## Summary

Add the ability to mark/unmark a project's status as "Verified" or "Unverified" directly from the Project Detail page, with a reason log so the team knows why verification was revoked.

## Changes

### 1. Database Migration

Create a `project_verification_log` table to track verification/unverification history:

```sql
CREATE TABLE project_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  action text NOT NULL, -- 'verified' or 'unverified'
  reason text NOT NULL DEFAULT '',
  performed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE project_verification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read verification log" ON project_verification_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert verification log" ON project_verification_log FOR INSERT TO authenticated WITH CHECK (true);
```

### 2. ProjectDetail.tsx — Add Verification Toggle

Add a prominent button next to the status badge:
- If status is **Verified** → show "Mark Unverified" button (red/warning style)
- If status is anything else → show "Mark Verified" button (green style)

Clicking either opens a small dialog asking for a **reason** (required text field). On submit:
1. Update `projects.status` to `'Verified'` or `'Pending'`
2. Insert a row into `project_verification_log` with action, reason, and user ID
3. Show toast confirmation

### 3. Verification History Tab

Add a "Verification History" section inside the existing project detail tabs showing the log entries (timestamp, action, reason, who performed it).

### 4. Projects List — Visual Indicator

On the Projects list page, projects that were recently unverified (last 7 days) get a small warning indicator so analysts notice them.

## Files Changed

| Action | File |
|--------|------|
| Migration | Create `project_verification_log` table |
| Modify | `src/pages/dashboard/ProjectDetail.tsx` — toggle button + reason dialog + history section |
| Modify | `src/pages/dashboard/Projects.tsx` — recently unverified indicator |

