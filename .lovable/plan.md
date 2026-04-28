## Plan: Recategorize features to reduce dashboard clutter

Yes — the dashboard has grown into too many separate navigation items. The best MVP move is to group features by user workflow, not by internal feature name. This keeps the product powerful while making it feel simpler.

### Proposed navigation structure

```text
1. Command Center
   - Overview
   - Ask AI
   - Alerts

2. Projects & Portfolio
   - Projects
   - My Portfolio
   - Portfolio Chat
   - Compare Projects
   - Pipeline View

3. Market Intelligence
   - Geo Intelligence
   - Country Intelligence
   - Tenders & Awards
   - Tender Calendar
   - Stakeholder Intel

4. Reports & Insights
   - Intelligence Summaries
   - Insights
   - Datasets

5. Research Operations
   - Research
   - Evidence & Verification
   - Review Queue
   - Agents

6. Admin
   - Traction
   - BD Pipeline
   - Subscribers
   - Users
   - Feedback Inbox
   - Settings
```

### MVP simplification recommendation

For regular users, show only the most valuable workflow items:

```text
Command Center
- Overview
- Ask AI
- Alerts

Projects & Portfolio
- Projects
- My Portfolio
- Portfolio Chat

Market Intelligence
- Tenders & Awards
- Country Intelligence
- Tender Calendar

Reports
- Intelligence Summaries
```

Researcher/admin-only operational tools should stay hidden from normal users:
- Research
- Evidence & Verification
- Review Queue
- Agents
- Insights management
- Datasets
- Subscribers
- Users
- BD/traction tools

### Consolidations to avoid overload

1. Merge project tools under `Projects`
   - Keep `Projects` as the primary dataset page.
   - Keep `Risk Signals` and `Analytics` as tabs inside Projects, as already done.
   - Consider moving `Compare Projects` and `Pipeline View` into Projects as tabs or quick actions later.

2. Merge tender features
   - Keep `Tenders & Awards` as the main page.
   - Make `Tender Calendar` a tab inside Tenders, or keep it as a secondary item only for paid users.
   - This reduces duplicated tender navigation.

3. Merge reports, digests, and AI summaries
   - Keep `Intelligence Summaries` as the main reporting hub.
   - Reports, digests, and generated market briefs should live there.
   - Avoid separate “Reports”, “Digests”, and “Analytics Reports” routes in the sidebar.

4. Move operational features away from the main user workflow
   - `Agents`, `Review Queue`, `Evidence & Verification`, and `Research` are internal production tools.
   - Keep them in a `Research Operations` group visible only to researcher/admin roles.

5. Rename groups around user outcomes
   - “Core” is too generic.
   - Better labels:
     - `Command Center`
     - `Projects & Portfolio`
     - `Market Intelligence`
     - `Reports & Insights`
     - `Research Operations`
     - `Admin`

### UI behavior improvements

- Keep sidebar mini-collapse enabled so users can reduce visual load.
- Keep active route highlighting.
- Auto-open the group containing the current page.
- Consider making groups collapsible so advanced sections do not dominate the screen.
- Keep locked premium items visible only where they create upgrade value; otherwise hide them to reduce clutter.

### Files to update

- `src/layouts/DashboardLayout.tsx`
  - Rebuild `NAV_GROUPS` around the new workflow groups.
  - Add active-group open behavior if supported by the current sidebar primitives.
  - Ensure collapsed sidebar still shows icons.

- `src/components/GuidedTour.tsx`
  - Update tour targets to match the recategorized nav.
  - Remove obsolete targets like old analytics/risk/monitoring nav items.

- `FEATURES.md`
  - Update the navigation consolidation notes to reflect the new group structure.

### Acceptance criteria

- Regular users see a simpler dashboard with fewer top-level choices.
- Research/admin tools no longer distract normal users.
- Related features are grouped by workflow instead of feature type.
- Current routes continue to work.
- Existing paid feature locks remain intact.
- Guided tour no longer points to removed or renamed navigation items.