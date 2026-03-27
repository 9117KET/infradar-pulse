

# Role-Based Onboarding & Personalized Access Control

## Research: Who Else Would Pay for This

Beyond the 4 personas already built (Investors/CFOs, Strategy Leaders, Project Leaders, Business Development), here are additional high-value buyer segments:

### Additional Personas
| Persona | Why They Pay | Example Companies |
|---------|-------------|-------------------|
| **Development Finance Institutions (DFIs)** | Track $300B+ portfolio across Africa/MENA, verify project milestones | IFC, AfDB, EBRD, Africa Finance Corporation, British International Investment, Norfund, DEG, FMO |
| **EPC Contractors & Engineering Firms** | Bid intelligence, pipeline tracking, competitor monitoring | Bechtel, Fluor, AECOM, Dar Group, Julius Berger, Orascom, China State Construction |
| **Insurance & Risk Underwriters** | Construction risk assessment, political risk pricing | AXA XL, Swiss Re, Munich Re, Africa Trade Insurance Agency (ATI) |
| **Government & Sovereign Wealth Funds** | Portfolio oversight, cross-sector coordination, economic planning | ADIA, Mubadala, PIF, NSIA Nigeria, Ithmar Capital Morocco |
| **Legal & Advisory Firms** | Due diligence support, regulatory tracking for project finance deals | Clifford Chance, White & Case, Hogan Lovells, ALN, DLA Piper |
| **Multilateral / NGO Programs** | Impact monitoring, grant/project verification | UNDP, GIZ, USAID, Power Africa, World Bank |
| **Supply Chain & Logistics** | Track construction material demand, port/transport project timing | DP World, Maersk, Dangote, LafargeHolcim |

### Tiered Access Model
Each persona doesn't need the full platform. A DFI cares about project verification and risk — they don't need bid intelligence. A contractor cares about pipeline and tenders — they don't need satellite verification. This naturally maps to tiered pricing and filtered dashboards.

---

## What We're Building

### 1. User Profiles with Role & Preferences (Database)
Create a `profiles` table that captures:
- **Role** (dropdown during signup): Investor, Strategy, Project Manager, Business Dev, DFI Analyst, Contractor, Insurance/Risk, Government, Legal/Advisory, Supply Chain
- **Regions of interest** (multi-select): MENA, East Africa, West Africa
- **Sectors of interest** (multi-select): Urban Development, Digital Infrastructure, Renewable Energy, Transport, Water, Energy
- **Project stages of interest** (multi-select): Planned, Tender, Awarded, Financing, Construction, Completed
- **Company name**, **display name**

Auto-create profile via database trigger on signup.

### 2. Multi-Step Onboarding Flow
After first login, if profile is incomplete, redirect to `/onboarding` — a 3-step wizard:
1. **Your Role** — select persona type + company name
2. **Your Focus** — pick regions, sectors, stages of interest
3. **Welcome** — summary of what they'll see, CTA to dashboard

### 3. Filtered Dashboard Experience
- `useProjects` hook filters by user's region/sector/stage preferences (client-side filter, no RLS change needed — all approved projects remain public-read)
- Dashboard Overview KPIs reflect only the user's filtered scope
- Sidebar shows role-appropriate nav items (e.g. contractors don't see "Waitlist" admin pages; DFI analysts see "Verification" prominently)
- User can adjust preferences from Settings page

### 4. Settings Page Enhancement
Add a "Preferences" tab to the existing Settings page where users can update their role, regions, sectors, and stages after onboarding.

---

## Files Changed

| Action | File |
|--------|------|
| Migration | Create `profiles` table, trigger for auto-creation on signup |
| Create | `src/pages/Onboarding.tsx` — 3-step wizard |
| Modify | `src/contexts/AuthContext.tsx` — fetch profile, expose preferences |
| Modify | `src/layouts/DashboardLayout.tsx` — redirect to onboarding if profile incomplete, filter nav by role |
| Modify | `src/hooks/use-projects.ts` — accept filter preferences, apply client-side |
| Modify | `src/pages/dashboard/Overview.tsx` — filter KPIs by preferences |
| Modify | `src/pages/dashboard/Settings.tsx` — add Preferences tab |
| Modify | `src/App.tsx` — add `/onboarding` route |

## Technical Details

**Migration SQL:**
```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text DEFAULT '',
  company text DEFAULT '',
  role text DEFAULT '',
  regions text[] DEFAULT '{}',
  sectors text[] DEFAULT '{}',
  stages text[] DEFAULT '{}',
  onboarded boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON profiles FOR SELECT
  TO authenticated USING (id = auth.uid());
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Onboarding wizard** uses local state across 3 steps, then upserts to `profiles` table on completion with `onboarded = true`.

**AuthContext** expands to fetch profile after auth state change and expose `profile` + `profileLoading` in context. DashboardLayout checks `profile?.onboarded` and redirects to `/onboarding` if false.

**Role-based nav filtering:** Define which nav items each role sees. Admin-only items (Waitlist, Users, Agents, Review Queue) only show for admin roles. All analytics users see core intelligence pages.

