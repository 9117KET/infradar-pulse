# Pre-launch remediation runbook

Companion to the pre-launch audit. The **code** fixes are on branch
`fix/prelaunch-tier1`. The steps below are the parts that must be applied to
the hosted project directly — Lovable pulls frontend code from GitHub, but
**database migrations and Edge Function deploys do NOT auto-apply**, and the
existing corrupt rows live only in prod.

Prod project ref: `yofglpxqpouqqhkidlkx`.

---

## A. Code fixes already made (branch `fix/prelaunch-tier1`)

These take effect on the next frontend/functions deploy — no manual DB step.

| Fix | File |
|---|---|
| `Project.value` alias populated (Portfolio/Countries/Compare/Pipeline totals were $0/"—") | `src/hooks/use-projects.ts` |
| Capped plans now page past PostgREST's 1000-row ceiling; Pro sees the full set; stable `(value_usd, id)` order stops duplicate/dropped rows | `src/hooks/use-projects.ts` |
| "Save to Review Queue" now surfaces insert failures instead of a false success toast | `src/pages/dashboard/Research.tsx` |
| ProjectEditor error-checks the delete-then-reinsert of stakeholders/milestones (no more silent data loss behind "Project updated") | `src/pages/dashboard/ProjectEditor.tsx` |
| `isLiveCheckoutEnabled()` de-inverted (was disabling checkout exactly when payments go live) | `src/lib/lemonSqueezy.ts` |
| Central ingest sanitizer: `value_usd` reconciled to `value_label`, `confidence` rescaled to the 0-100 integer scale — protects all 10 ingest agents | `supabase/functions/_shared/sanitizeProjectFacts.ts` + `_shared/pipelineIngest.ts` |

---

## B. Prod database — apply in the Supabase SQL editor

### B1. Security grants (safe, non-destructive) — apply now

Run migration `supabase/migrations/20260805120000_prelaunch_security_grants.sql`
(revokes `list_admin_emails()` and `resolve_agent_auth_alerts(text)` from
`authenticated`; both were reachable by any signed-in user).

### B2. Fix inflated `value_usd` (recoverable — label is intact)

`value_usd` is `bigint` and some LLM-ingested rows are ~1000x too large
(e.g. $100,000,000,000,000 for a project whose `value_label` says "$100B"),
which makes the public pipeline headline read ~3.5x world GDP. The label is
the human-readable figure, so we reconcile against it.

**Dry run first — review what would change:**

```sql
WITH calc AS (
  SELECT id, name, value_usd, value_label,
    (regexp_match(lower(value_label),
      '([0-9][0-9,]*\.?[0-9]*)\s*(trillion|tn|t|billion|bn|b|million|mn|m|thousand|k)')) AS m
  FROM public.projects
), parsed AS (
  SELECT id, name, value_usd, value_label,
    CASE WHEN m IS NULL THEN NULL
      ELSE replace(m[1], ',', '')::numeric * CASE
        WHEN m[2] IN ('trillion','tn','t') THEN 1e12
        WHEN m[2] IN ('billion','bn','b')  THEN 1e9
        WHEN m[2] IN ('million','mn','m')  THEN 1e6
        WHEN m[2] IN ('thousand','k')      THEN 1e3 END
    END AS label_usd
  FROM calc
)
SELECT id, name, value_usd AS current_value, round(label_usd) AS corrected_value, value_label
FROM parsed
WHERE label_usd IS NOT NULL AND label_usd > 0
  AND (value_usd::numeric / label_usd >= 10 OR value_usd::numeric / label_usd <= 0.1)
ORDER BY value_usd DESC;
```

**Apply after reviewing the dry-run output** (same WHERE clause):

```sql
WITH calc AS (
  SELECT id, value_usd, value_label,
    (regexp_match(lower(value_label),
      '([0-9][0-9,]*\.?[0-9]*)\s*(trillion|tn|t|billion|bn|b|million|mn|m|thousand|k)')) AS m
  FROM public.projects
), parsed AS (
  SELECT id, value_usd,
    CASE WHEN m IS NULL THEN NULL
      ELSE replace(m[1], ',', '')::numeric * CASE
        WHEN m[2] IN ('trillion','tn','t') THEN 1e12
        WHEN m[2] IN ('billion','bn','b')  THEN 1e9
        WHEN m[2] IN ('million','mn','m')  THEN 1e6
        WHEN m[2] IN ('thousand','k')      THEN 1e3 END
    END AS label_usd
  FROM calc
)
UPDATE public.projects p
SET value_usd = round(parsed.label_usd)
FROM parsed
WHERE p.id = parsed.id
  AND parsed.label_usd IS NOT NULL AND parsed.label_usd > 0
  AND (p.value_usd::numeric / parsed.label_usd >= 10 OR p.value_usd::numeric / parsed.label_usd <= 0.1);
```

### B3. Fix "1% confidence" rows (NOT SQL-recoverable)

`confidence` is `integer`, so the LLM's 0-1 probability (e.g. 0.98) was
**truncated to 1 on insert** — the original value is gone; multiplying by 100
would wrongly assert 100% certainty. Two options:

- **Preferred:** deploy the fixed `ebrd-ingest-agent` (now goes through the
  sanitizer) and re-run it; the deterministic score recomputes correctly.
  Review the resulting `update_proposals`.
- **Quick cosmetic floor** until re-ingest, to remove the "1%" embarrassment
  (approximation — sets a conservative default, not the true value):

  ```sql
  UPDATE public.projects
  SET confidence = 60
  WHERE approved = true AND confidence <= 1;
  ```

---

## C. Prod Edge Functions

### C1. Delete the orphaned `env-diag` function — do now

It is live, fully unauthenticated, and no longer in the repo (deleted in
`ec8a0ad`) — code running in prod that is outside every review/CI check.

```bash
supabase functions delete env-diag --project-ref yofglpxqpouqqhkidlkx
```

Then reconcile deployed vs repo and check for other orphans:

```bash
supabase functions list --project-ref yofglpxqpouqqhkidlkx
# diff against: ls supabase/functions/
```

### C2. Payments ("flip the switch") bundle — before `VITE_PAYMENTS_LIVE=true`

All six `lemonsqueezy-*` functions return 404 in prod (not deployed) and the
LS schema migration is unapplied. Until every item below is done, keep
`VITE_PAYMENTS_LIVE` off — otherwise a paying customer is charged while the
404'ing webhook never records the subscription (money in, no access).

1. Apply migration `20260724120000_lemonsqueezy_provider.sql` (adds
   `subscriptions.provider` / `ls_*` columns and `claim_lifetime_seat_ls`).
   **This also fixes the `useEntitlements` query that currently 400s on
   `ls_customer_id`.** Verify `claim_lifetime_seat_ls` does not use
   `SELECT count(*) ... FOR UPDATE` (invalid) before relying on lifetime
   purchases.
2. `supabase functions deploy lemonsqueezy-create-checkout lemonsqueezy-webhook lemonsqueezy-portal lemonsqueezy-change-plan lemonsqueezy-cancel lemonsqueezy-resume --project-ref yofglpxqpouqqhkidlkx`
3. Register the webhook URL + signing secret in the Lemon Squeezy dashboard;
   set `LEMONSQUEEZY_WEBHOOK_SECRET` and the `VITE_LEMONSQUEEZY_STORE_ID` /
   variant-id secrets.
4. Run one real sandbox purchase end-to-end and confirm a `subscriptions` row
   is written and entitlements resolve to the paid plan.

### C3. Public "Ask AI" demo rate limiter — before promoting the demo

`nl-search-public` calls an LLM unauthenticated. Its rate-limit table
(`public_demo_rate_limits`, migration `20260522000001`) is not applied in prod,
and the demo charges quota only on non-empty results. Apply that migration, set
`DEMO_COOKIE_SECRET` and `DEMO_IP_SALT` Edge Function secrets (they fall back to
a value published in this public repo), and deploy the `nl-search-public` fix
that meters every call.

---

## D. Suggested order

1. B1 (grants) + C1 (delete env-diag) — fast, safe, security wins.
2. Merge `fix/prelaunch-tier1` → deploy frontend + functions.
3. B2 (value_usd) + B3 (confidence re-ingest) — fixes the public numbers.
4. C3 (demo rate limiter) before pushing the public "Ask AI" demo.
5. C2 (payments bundle) only when you are ready to charge.
