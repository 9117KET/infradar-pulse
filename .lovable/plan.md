

# Role-Based Access Control + Guided Onboarding

## Overview

Implement a proper 3-tier role system (user, researcher, admin) with a `user_roles` table, role-based navigation/access, admin user management, and an interactive guided onboarding tour that highlights platform features.

## Roles

| Role | Access |
|------|--------|
| **user** | Core (Overview, Research, Projects), Intelligence, Analysis. Limited to own data. Free trial period. |
| **researcher** | Everything user has + Operations (Monitoring, Alerts, Agents, Review Queue) + enhanced Research with API tools for verification |
| **admin** | Full access including Admin section (Subscribers, Users, Settings). Can assign/revoke roles. |

## Database Changes

### 1. Create `user_roles` table (per security guidelines)

```sql
CREATE TYPE public.app_role AS ENUM ('user', 'researcher', 'admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
```

### 2. Security definer function

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;
```

### 3. Auto-assign 'user' role on signup

Add to the existing `handle_new_user` trigger function — insert a default `user` role row.

### 4. RLS policies on `user_roles`

- Authenticated users can read their own roles
- Admins can read all + insert/update/delete (via `has_role`)

## Frontend Changes

### `AuthContext.tsx` — Add role to context

- Fetch user's roles from `user_roles` table alongside profile
- Expose `roles: app_role[]` and helper `hasRole(role)` in context
- No changes to profile table (roles stay in separate table)

### `DashboardLayout.tsx` — Role-based navigation

Replace the current hacky `ADMIN_ROLES` set with proper role checks:
- **user**: sees Core + Intelligence + Analysis groups only
- **researcher**: sees Core + Intelligence + Operations + Analysis (no Admin)
- **admin**: sees everything

Define a `requiredRole` per nav group or per item, filter using `hasRole()`.

### `Users.tsx` — Real user management (admin only)

Replace hardcoded mock data with:
- Fetch all profiles + their roles from the database
- Table showing name, email, role, last active
- Admin can click to assign/change a user's role (dropdown: user → researcher → admin)
- "Invite Researcher" button: admin enters an email, and when that user signs up they get `researcher` role

### `Onboarding.tsx` — Enhanced guided onboarding (6 steps)

Expand from 3 steps to 6:

1. **Welcome + Name/Company** (existing step 0)
2. **Your Role** (existing role selection — now also sets app_role context for personalization)
3. **Focus Areas** (existing regions/sectors/stages)
4. **Platform Tour: Core Features** — visual cards explaining Overview, Projects, Research with screenshots/icons and short descriptions
5. **Platform Tour: Intelligence & Analysis** — explains Geo Intelligence, Evidence Verification, Risk Signals, Analytics, Insights
6. **Platform Tour: Getting Started** — role-specific tips (e.g., "As an Investor, start with Risk Signals" or "As a Contractor, check Tender-stage projects"), then "Go to Dashboard"

Each tour step shows:
- Feature icon + name
- 1-2 sentence description of what it does
- A "highlight" card with a mini mockup or icon illustration
- Progress bar showing 6 steps

### Route protection

- Wrap admin-only routes (`/dashboard/subscribers`, `/dashboard/users`) with a role check — redirect non-admins to `/dashboard`
- Wrap researcher-only routes (`/dashboard/review`, `/dashboard/agents`) similarly
- Add a `<RoleGuard requiredRole="admin">` wrapper component used in `DashboardLayout` or individual pages

## Files

| Action | File |
|--------|------|
| SQL Migration | Create `user_roles` table, `has_role` function, RLS policies, update trigger |
| Modify | `src/contexts/AuthContext.tsx` — fetch roles, expose `hasRole()` |
| Create | `src/components/RoleGuard.tsx` — route protection component |
| Modify | `src/layouts/DashboardLayout.tsx` — role-based nav filtering |
| Rewrite | `src/pages/dashboard/Users.tsx` — real user management with role assignment |
| Rewrite | `src/pages/Onboarding.tsx` — 6-step onboarding with platform tour |
| Modify | `src/App.tsx` — wrap protected routes with RoleGuard |

