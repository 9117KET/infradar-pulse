## What this delivers

Three connected queue-transition rules so the Pipeline Candidates queue stops leaking work back to researchers.

### 1. Approved → Project with full evidence trail
`promote_project_candidate` already exists and copies evidence_sources, project_claims, stakeholders, and writes review_actions + project_verification_log. We will:
- Verify and harden the function (idempotent on re-approval, slug collision safe — already done).
- Add a sanity guarantee: the new project gets at least one row in `evidence_sources` derived from `candidate_evidence_links`; if zero links exist, the function raises so a candidate with no evidence cannot be approved.
- The client already calls this RPC from ReviewQueue → no change needed there.

### 2. Rejected → Deduplicated, won't reappear
Today, rejecting a candidate only flips its status; the next agent run can re-insert the same name+country pair and it lands back in the queue.

New piece: `candidate_rejection_signatures` table keyed on `(normalized_name, country)` with `reason`, `rejected_by`, `rejected_at`, `source_url_pattern`.

- New RPC `reject_project_candidate(p_id, p_reason)` — staff-only. Flips status, inserts review_actions row, upserts a signature.
- New trigger `trg_suppress_rejected_candidates` on `project_candidates` (BEFORE INSERT OR UPDATE) — if a matching signature exists, force `review_status = 'rejected'`, `pipeline_status = 'rejected'`, append a note to `extracted_claims` indicating auto-suppression. This means even if the ingest path forgets to check, the database enforces it.
- `pipelineIngest.ts` gets a fast-path: before the insert/update, query signatures; if matched, skip the candidate insert entirely (still keeps the raw_evidence row for audit). Reduces noise and saves writes.
- ReviewQueue's `candidateAction` for `rejected` switches from a direct UPDATE to calling the new RPC.

### 3. Researcher digest when queue backs up
New edge function `review-queue-digest` + daily cron at 08:00 UTC.

- Queries: count of `ready_for_review` candidates, oldest 10 (with age in days), breakdown by sector and country, count of pending update_proposals.
- Triggers email only when backlog ≥ 25 OR oldest item ≥ 5 days old.
- Recipients = admins + researchers (new RPC `list_staff_emails` returning both roles).
- Reuses the queued-email pattern (`enqueue_email` → `transactional_emails`) with idempotency_key scoped to date so we never double-send.
- Service-role bearer guard like agent-health-monitor.

## Files

**Migration** (one file):
- `candidate_rejection_signatures` table + RLS (staff read/write).
- `reject_project_candidate(uuid, text)` RPC.
- `_suppress_rejected_candidates()` trigger function + trigger.
- Hardening clause in `promote_project_candidate`: raise if no evidence links.
- `list_staff_emails()` RPC (admin + researcher).

**Edge function (new):** `supabase/functions/review-queue-digest/index.ts`

**Cron schedule (via supabase insert tool, not migration — contains URL + key):** daily 08:00 UTC invoking the new function.

**Code edits:**
- `supabase/functions/_shared/pipelineIngest.ts` — pre-check signatures, skip if matched.
- `src/pages/dashboard/ReviewQueue.tsx` — reject path calls `reject_project_candidate` RPC.

## Why these specific choices

- DB-level trigger is the durable enforcement layer; the edge-function pre-check is the perf optimisation. Both together = belt + braces.
- `(normalized_name, country)` is the same key the pipeline already uses for upsert, so signatures align with how duplicates are detected upstream.
- Digest goes out only when there is real backlog; otherwise silent — researchers won't tune it out.
- All three pieces are independent and shippable, but they reinforce each other: rejections don't loop, approvals carry their receipts, and the inbox metric stays visible.
