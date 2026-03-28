

# Contact Finder Agent & Verification Contacts System

## Summary

Build a new `contact-finder` edge function that discovers phone numbers, emails, and key personnel for infrastructure projects and their contractors. Contacts are stored in a `project_contacts` table and displayed in a new "Contacts" tab on the Project Detail page. The agent runs on a 24/7 automated schedule alongside the existing agents, and the research agent is updated to extract contacts during initial discovery.

---

## Database Migration

**New table: `project_contacts`**

| Column | Type | Default |
|--------|------|---------|
| id | uuid PK | gen_random_uuid() |
| project_id | uuid FK → projects.id ON DELETE CASCADE | |
| name | text | |
| role | text | '' |
| organization | text | '' |
| phone | text | null |
| email | text | null |
| source | text | '' |
| source_url | text | null |
| verified | boolean | false |
| added_by | text | 'ai' |
| created_at | timestamptz | now() |

RLS: public SELECT, authenticated INSERT/UPDATE/DELETE (matches existing patterns).

**Insert policy for alerts table** — the contact-finder agent uses service role so this is not strictly needed, but the research-agent already inserts alerts via service role.

**pg_cron schedule** — add a cron job to invoke `contact-finder` every 3 hours (similar to existing agent schedules).

---

## New Edge Function: `contact-finder`

`supabase/functions/contact-finder/index.ts`

Flow:
1. Query projects with fewer than 2 contacts (batch of 10)
2. For each project, search via **Perplexity**: `"{project.name}" {project.country} contact phone email project manager contractor procurement`
3. If **Firecrawl** key available, scrape any contractor/stakeholder websites from `project_stakeholders` and `evidence_sources`
4. Pass all raw content to **Lovable AI** (Gemini) with structured extraction tool call for contacts: name, role, organization, phone, email, source
5. Deduplicate against existing `project_contacts` by (project_id, name, organization)
6. Insert new contacts, log results in `research_tasks` with task_type `contact-finder`
7. Create alert for each project that received new contacts

---

## Update Research Agent

Modify `supabase/functions/research-agent/index.ts`:
- Add optional `contacts` array to the AI extraction schema (name, role, organization, phone, email)
- After inserting a new project, also insert any extracted contacts into `project_contacts`

---

## Frontend Changes

### ProjectDetail.tsx — Add "Contacts" tab
- New tab: **Contacts** (count badge) alongside Overview, Analysis, Evidence, Timeline
- Table showing: Name, Role, Organization, Phone (`tel:` link), Email (`mailto:` link), Source, Verified badge
- "Add Contact" inline form (name, role, org, phone, email — added_by = 'human')
- Toggle verified button, delete button per contact
- Also delete contacts in the `handleDelete` project cleanup

### AgentMonitoring.tsx — Add Contact Finder agent
- Add to `AGENTS` array: `{ type: 'contact-finder', name: 'Contact Finder', icon: Phone, schedule: 'Every 3 hours', fn: agentApi.runContactFinder }`

### src/lib/api/agents.ts
- Add `runContactFinder: () => invokeAgent('contact-finder')`

### src/hooks/use-projects.ts
- Fetch `project_contacts` alongside other related data
- Add `contacts` array to the project interface

### src/data/projects.ts
- Add `Contact` interface and include `contacts: Contact[]` in the Project type

---

## Automated 24/7 Schedule

After deployment, set up a pg_cron job (via SQL insert, not migration) to call the contact-finder function every 3 hours, matching the pattern of existing scheduled agents:

```sql
select cron.schedule(
  'contact-finder-agent',
  '0 */3 * * *',
  $$ select net.http_post(
    url:='https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/contact-finder',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id; $$
);
```

---

## Files Changed

| Action | File |
|--------|------|
| Migration | Create `project_contacts` table with FK + RLS |
| Create | `supabase/functions/contact-finder/index.ts` |
| Modify | `supabase/functions/research-agent/index.ts` — extract contacts on discovery |
| Modify | `src/pages/dashboard/ProjectDetail.tsx` — add Contacts tab |
| Modify | `src/pages/dashboard/AgentMonitoring.tsx` — add Contact Finder |
| Modify | `src/lib/api/agents.ts` — add `runContactFinder` |
| Modify | `src/hooks/use-projects.ts` — fetch contacts |
| Modify | `src/data/projects.ts` — add Contact type |
| SQL insert | pg_cron schedule for 24/7 automation |

