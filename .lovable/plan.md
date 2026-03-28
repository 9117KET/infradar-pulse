

# Enhanced Contractor Email Discovery & Display

## Summary

The existing `contact-finder` agent and `project_contacts` table already support emails, phones, roles, and organizations. The gap is that the agent doesn't specifically prioritize **main contractor contacts** and the UI doesn't highlight them. Rather than a new agent, we enhance the existing one and improve how contractor info is surfaced.

## Changes

### 1. Enhance Contact Finder Agent

Update `supabase/functions/contact-finder/index.ts`:
- Modify the Perplexity search query to explicitly target "main contractor email procurement officer EPC" keywords
- Update the AI extraction prompt to prioritize contractor roles (Project Manager, Procurement, Site Manager, CEO, etc.) and require `organization` and `email` as strongly preferred fields
- Add a `contact_type` concept via the `role` field — prompt AI to tag contacts as "Main Contractor", "Sub-Contractor", "Government Official", "Project Owner", etc.

### 2. Add `contact_type` Column to `project_contacts`

Database migration to add a `contact_type` field for categorizing contacts:

```sql
ALTER TABLE project_contacts ADD COLUMN contact_type text NOT NULL DEFAULT 'general';
```

Values: `contractor`, `government`, `financier`, `consultant`, `owner`, `general`

Update the contact-finder agent to set this field based on AI extraction.

### 3. Update Project Detail — Contacts Tab

In `ProjectDetail.tsx`:
- Group contacts by `contact_type` (Contractors section shown first, then others)
- Show contractor contacts with a distinct visual style (e.g., hard hat icon, highlighted card)
- Add `contact_type` dropdown to the manual "Add Contact" form
- Display organization name prominently alongside email/phone

### 4. Update Research Agent

In `research-agent/index.ts`, when discovering new projects, also extract main contractor name and add it as a contact with `contact_type = 'contractor'` in `project_contacts`.

### 5. Agent Monitoring Label

Update `AgentMonitoring.tsx` description for Contact Finder to reflect its enhanced contractor-focus.

## Files Changed

| Action | File |
|--------|------|
| Migration | Add `contact_type` to `project_contacts` |
| Modify | `supabase/functions/contact-finder/index.ts` — contractor-focused prompts |
| Modify | `supabase/functions/research-agent/index.ts` — extract contractor on discovery |
| Modify | `src/pages/dashboard/ProjectDetail.tsx` — grouped contacts by type, add type to form |

