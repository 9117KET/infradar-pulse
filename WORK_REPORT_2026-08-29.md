# Work report — 2026-08-29

Covers the cron-credential outage investigation, the surface-area reduction pass, and the
data-integrity review of the quality-scoring layer.

All seven pull requests from this work are merged to `main` (`a7bb98b`), which carries
#11 and #12 together. Unit suite 150/150, `tsc` and build clean.

**One thing dominates everything below: the scheduled agents have not run since 2026-07-22.**
Every change here governs how records are scored, promoted, deduplicated and recorded *when
ingest runs*. None of it does anything to a pipeline that is not moving. See
[Blocking](#blocking-on-you) first.

---

## Blocking (on you)

### 1. The vault secret — day 39

`pg_cron` is still presenting a stale service-role key. Every scheduled agent has been
silent since 2026-07-22.

```sql
-- 1. Did the migration land? (If this errors, Lovable did not sync it —
--    paste supabase/migrations/20260828120000_cron_auth_via_vault.sql into the SQL editor.)
SELECT * FROM public.cron_auth_preflight();

-- 2. Set the current service-role key from Settings → API Keys.
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'email_queue_service_role_key'),
  '<service_role key>', 'email_queue_service_role_key', 'rotated');
```

The key must **byte-match** the `SUPABASE_SERVICE_ROLE_KEY` the Edge Functions hold —
`requireStaff.ts:40` compares by exact string equality.

**Confirm with outcomes, not preflight.** `cron_auth_preflight()` validates structure and
cannot detect a key from the wrong project:

```sql
SELECT max(last_run_at) FROM agent_config WHERE enabled;   -- must advance
SELECT * FROM public.cron_http_failures WHERE created > now() - interval '1 hour';  -- must stay empty
```

> **Expect quality scores to fall across the board** once ingest restarts and real dates flow
> through for the first time. That is four merged PRs working correctly, not a regression.

### 2. One decision — finding 01

`quality_scores` has two writers and no reader. Either make it the read path (display, rank,
filter — plus a recompute so it does not re-freeze), or delete it and score on read.

PR #10 made the table cheap and correct to keep, so this is no longer urgent. But it is the
last open question from the review, and it gates how far the reweight in #9 actually reaches:
today it only affects users through Review Queue's live recompute.

---

## Fixed

### The outage: cron credentials — [#5](https://github.com/9117KET/infradar-pulse/pull/5)

**Root cause.** Seven migrations (`20260421000001` … `20260706200656`) built the
`Authorization` header at *schedule* time, freezing a JWT into `cron.job.command`. A key
rotation left all 40 such jobs firing on schedule while every HTTP call returned 401.

**Why it stayed invisible for 34 days.** `net.http_post()` is asynchronous — it queues the
request and returns an id, so pg_cron records the run as *succeeded* regardless of what the
endpoint answers. `cron.job_run_details` stayed green through a month of 401s. The external
GitHub Actions heartbeat was the only thing that caught it, because it checks
`agent_config.last_run_at` — the outcome — rather than whether jobs fired. **It was reporting
a true positive the entire time.**

**Fix.** Jobs call `public._agent_cron_auth_header()`, which reads the key from vault on every
invocation. Rotation is now a one-line vault update with no re-scheduling.

Added alongside it:

| Object | Purpose |
|---|---|
| `cron_auth_preflight()` | Offline key validation — JWT shape, `role` claim, expiry, `sb_secret_*` vs `sb_publishable_*` |
| `cron_jobs_with_baked_credentials()` | Regression gate; must return zero rows |
| `rewrite_cron_baked_credentials()` | Idempotent repair, callable by hand |
| `cron_http_failures` | Surfaces the async HTTP outcomes `job_run_details` cannot show |

Verified against a faithful replay of production: 40/40 jobs rewritten, 0 failed, `jobid`,
schedule, active flag and JSON bodies preserved byte-for-byte.

### Surface area — [#6](https://github.com/9117KET/infradar-pulse/pull/6)

- **7 of 9 paywalls removed.** AI, exports and insight reads were *already* metered per plan
  by `PLAN_LIMITS` server-side; nine hard locks sat on top of that, gating views of the same
  project table. Kept `portfolio_chat` and `intelligence_summaries` — the two with real
  marginal cost per use. Catalog trimmed 12 keys → 2.
- **`/careers` and `/press` deleted** — 21- and 25-line stubs. Routes, pages, footer links and
  sitemap entries.
- **5 redundant daily MDB ingest crons** removed conditionally. Five sources ran *both* a
  daily ingest and an hourly cursor-driven backfill; per `_shared/ingestCursor.ts`, an
  exhausted cursor resets to 0 so the hourly job doubles as refresh. Each removal is verified
  at apply time — the hourly twin must be active *and* every cursor exhausted — otherwise the
  daily job is kept and the reason reported. Idempotent; re-run to collect stragglers.

### Freshness was a constant — [#7](https://github.com/9117KET/infradar-pulse/pull/7)

`freshness_score` was not a decaying snapshot. It was **pinned at 100 on every row ever
written**: both edge call sites passed `lastUpdated: new Date()`, measuring the age of the
*ingest* rather than of the *record*. The `ageDays > 30/90/180` tiers were unreachable dead
code and `stale_record` could never fire from the ingest path.

Three silent-fresh paths, all closed:

| Input | Old | Now |
|---|---|---|
| missing date | defaulted to `Date.now()` → 100 | 45 + `unknown_freshness` |
| unparseable date | `NaN` fails every `>` compare → 100 | 45 + `unparseable_last_updated` |
| future date | `Math.max(0, negative)` clamps to 0 → 100 | 45 + `future_last_updated` |

Rule: any path that cannot establish a real age fails toward *unknown*, never toward *fresh*.

Call sites now pass real timestamps — `input.publishedAt` at ingest, `project.last_updated` at
enrichment. **Caveat:** `projects.last_updated` is `NOT NULL` and tracks *row mutation*, so it
is a proxy for fact recency rather than a measure of it.

### Weighting, thresholds and flags — [#9](https://github.com/9117KET/infradar-pulse/pull/9)

**Finding 03.** Weights are now a named `QUALITY_WEIGHTS` constant with the reasoning written
down. Freshness 0.10 → 0.22, funded from completeness (0.20 → 0.13, a proxy for effort not
truth) and confidence (0.15 → 0.10, the extractor's own self-report). Source and evidence
unchanged. Measured before committing: no representative record flips its auto-publish
decision.

**Finding 04.** `AUTO_PUBLISH_MIN_QUALITY` (60) sitting below the scorer's `'approve'` line
(85) is *not* a bug, but nothing said so. They answer different questions and now document
that in code.

**Finding 06.** The auto-publish gate is the first consumer these flags have ever had.
`stale_record`, `unparseable_last_updated` and `future_last_updated` block promotion
regardless of score, and log which flag did it. `unknown_freshness` deliberately does **not**
block — a missing published date is an upstream feed limitation, not a defect in the record.

**Why 03 needed 06:** a stale record scores 60 *even after the reweight* — it still clears the
promotion floor. Raising the weight was necessary but not sufficient.

### Score history — [#10](https://github.com/9117KET/infradar-pulse/pull/10)

I initially reported `quality_scores` as a purposeless write-only table and suggested deleting
it might be reasonable. **That was wrong.** Its indexes — `(project_id, calculated_at DESC)`
and `(candidate_id, calculated_at DESC)` — are exactly the shape of a latest-score lookup. It
is a deliberately designed history table whose reader was never written.

What *was* wrong: both writers inserted unconditionally, recording a history of **runs**
rather than of **changes**. Under hourly backfills an unchanged record gained an identical row
every hour, forever. Writes are now conditional on the assessment actually differing.

**Ordering dependency:** this was only safe *because* freshness was fixed first. While
`freshness_score` was pinned at 100, a record ageing past 180 days produced a byte-identical
assessment — suppression would have silently discarded the transition into stale. Shipping
#10 before #7 would have introduced a data-loss bug.

### Navigation — [#11](https://github.com/9117KET/infradar-pulse/pull/11), [#12](https://github.com/9117KET/infradar-pulse/pull/12)

Source Health folded into Review Queue; Pipeline, Compare and Countries folded into Projects.
Nav entries 29 → 25. All retired routes redirect rather than 404, and stay in the crawl's
`STAFF_ROUTES` so the redirects remain covered.

Two pre-existing bugs surfaced: Projects' tabs were uncontrolled (`defaultValue`), so the URL
could deep-link *in* but a click never wrote back; and the page `<h1>` lived inside the
`"projects"` TabsContent, so Risk Signals and Analytics rendered with no heading at all. The
second was caught by an e2e assertion reporting 0 `h1` elements — typecheck and build were
both green through it.

---

## Deviations from the original plan

Three of five items were done as written. Two were deliberately scoped differently:

**Item 3 — `/snapshot` and `/ask-demo` kept.** The plan called them duplicates of `/explore`.
They are not: `/explore` contains no AI or query code at all. `/ask-demo` is the only public
AI trial and the hero's primary CTA. Removing either drops a funnel with nothing to redirect
to. The two genuinely empty stubs were removed.

**Item 5 — no MDB dispatcher.** The plan asked for one dispatcher running six adapters. That
would rewrite ~3,400 lines of upstream parsing — the code the product's data credibility rests
on — to reduce a cron count. Removed five genuinely duplicate cron jobs instead: a deletion
rather than an abstraction.

**Item 1 — 3 of 5 routes folded.** Pipeline, Compare and Countries read `useProjects()` and
qualify. Tenders (`tender_events`, `alerts`) and Tender Calendar (`project_milestones`) read
different tables; folding them into Projects would be miscategorisation, not consolidation.

---

## Open, not blocked

**`contradiction_penalty`** — a column that exists in `quality_scores` and is never written by
anything. You ingest overlapping coverage of the same projects from seven MDBs, and
`entity-dedup` already matches them; today that overlap is treated as a deduplication chore
and discarded at the moment of merge.

Showing *"2 of 3 sources agree within 2%; the outlier is 9 months older"* is the artifact a DFI
or EPC analyst needs, because it survives the question their committee asks: *where did this
number come from, and does anything contradict it?* It is finishing a half-built design, not
adding a feature — and it gives `quality_scores` a reason to be read.

**Blocked on live ingest.** It needs real overlapping multi-source records to build against.

**183 eslint problems** — all pre-existing. That number is unchanged across every PR in this
session, which was the point: proof none were introduced. Nobody has fixed them.

---

## Limitations of this work

**Nothing here was run against the production database.** Every "verified" claim in this
session means verified against the local stack, a simulated replay of production, or a
local-stack browser. Specifically:

- The cron diagnosis is inferred from migration source and a local replay, not observed in prod.
- "No readers of `quality_scores`" came from grepping `src/` and `supabase/functions/`. A read
  through a database view or RPC would not have been caught.
- `projects.last_updated` is assumed to be a reasonable proxy for fact recency. It tracks row
  mutation; if a source republishes unchanged facts, that still counts as "updated".
- Findings 03 and 04 are judgement calls about thresholds, not defects. The numbers may have
  been deliberate — nothing in the code said so.

Two read-only scripts are waiting to close the first two gaps:

```bash
SUPABASE_DB_URL='postgres://...' npm run test:cron-auth:prod
SUPABASE_DB_URL='postgres://...' npm run test:freshness
```

`test:freshness` reports how much of the stored corpus is stale behind a perfect score — the
number that decides whether existing `quality_scores` rows are worth backfilling.

---

## Test coverage added

| Suite | Count | Run |
|---|---|---|
| Cron auth (SQL, `BEGIN`/`ROLLBACK`, safe against any DB) | 45 assertions | `npm run test:cron-auth` |
| Freshness behaviour | 15 | `npm run test` |
| Client/edge scorer parity | 12 | `npm run test` |
| Quality policy (weights, thresholds, flags) | 11 | `npm run test` |
| Score-history write suppression | 15 | `npm run test` |
| Source Health tab (e2e) | 5 | `npx playwright test e2e/source-health-tab.spec.ts` |
| Projects tabs (e2e) | 8 | `npx playwright test e2e/projects-tabs.spec.ts` |

Unit suite total: **150 passing**.

Every new suite was **mutation-tested** — the change it guards was reverted to confirm the
tests actually fail. A test that passes against the broken code proves nothing.

> **E2E note:** `.env` targets the **hosted** project. Running the Playwright suites against
> it would authenticate and query production. Point a dev server at the local stack first:
>
> ```bash
> VITE_SUPABASE_URL="http://127.0.0.1:54321" \
> VITE_SUPABASE_PUBLISHABLE_KEY="<local publishable key>" npm run dev
> ```

---

## Reference

- Runbook: `docs/SCHEDULING.md` — cron credentials, rotation procedure, diagnosing silence
- Data-integrity review: https://claude.ai/code/artifact/b8634328-1266-442d-8812-33325d7cbb64
- Session: https://claude.ai/code/session_01PupUVKpoc7AMEPAuufGDkW
