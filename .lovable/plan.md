
# Review Queue Source Verification Fix

## What’s wrong now
The issue is real: the Review Queue fetches pending projects with `select('*')`, but the UI never renders `project.source_url` inside the expanded details. So even when a pending project already has a source URL, reviewers cannot see it.

There is also a second platform-wide issue: some projects may still be missing `source_url`, and current agent logic is not strict enough about guaranteeing verifiable URLs everywhere.

## Implementation plan

### 1) Fix the Review Queue UI first
Update `src/pages/dashboard/ReviewQueue.tsx` so expanded details show a clear verification block:
- Primary source link from `project.source_url`
- Friendly label like “Primary source”
- Open-in-new-tab button/icon
- Clear fallback state when no source exists yet, e.g. “Source link missing — requires enrichment before approval”

Also use the already-imported `ExternalLink` icon there.

### 2) Make missing-source records obvious before approval
Improve the review cards so source completeness is visible even before expansion:
- Add a small “Has source” / “Missing source” badge
- Optionally disable or warn on approval when `source_url` is empty
- This keeps “verified intelligence” aligned with the review workflow

### 3) Surface evidence links in the review flow
For pending projects, also load related `evidence_sources` for each project and show them in the expanded panel:
- List source name + source URL
- Mark verified/unverified if available
- This gives reviewers more than one verification path, not just a single primary URL

This is especially useful when `projects.source_url` is missing but `evidence_sources.url` exists.

### 4) Backfill missing URLs platform-wide
Strengthen `supabase/functions/data-enrichment/index.ts` so it prioritizes projects lacking:
- `source_url`
- evidence URLs
- contact source URLs where relevant

Enhance the enrichment output so it fills:
- `projects.source_url`
- additional `evidence_sources` entries when citations are available
- `project_contacts.source_url` consistently for discovered contacts

### 5) Tighten discovery agent requirements
Update `supabase/functions/research-agent/index.ts` so discovery is stricter:
- Treat source URL as required for accepted extraction output
- Prefer real citation URLs, not placeholders
- Skip or flag weak discoveries where no verifiable URL can be found
- Ensure every new pending project gets:
  - `projects.source_url`
  - matching `evidence_sources.url`
  - alert `source_url`
  - contact `source_url` when contacts are extracted

### 6) Improve contact-finder source fidelity
Update `supabase/functions/contact-finder/index.ts` so contact sourcing is more precise:
- Attach the best per-contact or per-batch source URL
- Avoid generic or ambiguous source assignment where possible
- Preserve verifiability for contractor emails and phone numbers

### 7) Keep editing and detail pages aligned
Review existing source handling in:
- `src/pages/dashboard/ProjectDetail.tsx`
- `src/pages/dashboard/ProjectEditor.tsx`
- `src/hooks/use-projects.ts`

These already support `sourceUrl`, so no major redesign is needed, but I would ensure:
- empty strings are treated consistently as missing
- links render prominently and safely
- manual edits preserve source integrity

## Files to update
- `src/pages/dashboard/ReviewQueue.tsx`
- `supabase/functions/research-agent/index.ts`
- `supabase/functions/data-enrichment/index.ts`
- `supabase/functions/contact-finder/index.ts`

## Expected outcome
After this:
- Every project under review visibly shows where the information came from
- Reviewers can click directly to verify the claim
- Missing-source projects are clearly flagged
- Agents continuously backfill and enforce source URLs across projects, alerts, evidence, and contacts

## Technical notes
- No schema migration is needed because `projects.source_url`, `alerts.source_url`, `insights.source_url`, and `project_contacts.source_url` already exist
- The biggest current gap is UI rendering in the Review Queue, not database structure
- The best verification UX is: primary project URL + supporting evidence URLs together in the review details
