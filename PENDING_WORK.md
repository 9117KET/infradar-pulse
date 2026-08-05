# Pending work — pre-launch

Outstanding items from the 2026-08-05 pre-launch audit. Detailed SQL and
commands live in [`docs/PRELAUNCH-REMEDIATION.md`](docs/PRELAUNCH-REMEDIATION.md);
this file is the scannable checklist. Legend: ❌ not done · ⚠️ apply & verify · ✅ done.

## Undeployed / orphaned Edge Functions

| Status | Function | Action |
|---|---|---|
| ❌ | `env-diag` | **Delete it.** Live in prod, unauthenticated (returns 200), deleted from the repo in `ec8a0ad` — running code outside all review. `supabase functions delete env-diag --project-ref yofglpxqpouqqhkidlkx` |
| ❌ | `lemonsqueezy-create-checkout` | Deploy before `VITE_PAYMENTS_LIVE=true` (404 in prod) |
| ❌ | `lemonsqueezy-webhook` | Deploy before go-live — without it a paid customer is charged but never provisioned |
| ❌ | `lemonsqueezy-portal` | Deploy before go-live (404) |
| ❌ | `lemonsqueezy-change-plan` | Deploy before go-live (404) |
| ❌ | `lemonsqueezy-cancel` | Deploy before go-live (404) |
| ❌ | `lemonsqueezy-resume` | Deploy before go-live (404) |

Deploy the six at once:
`supabase functions deploy lemonsqueezy-create-checkout lemonsqueezy-webhook lemonsqueezy-portal lemonsqueezy-change-plan lemonsqueezy-cancel lemonsqueezy-resume --project-ref yofglpxqpouqqhkidlkx`

## Migrations to apply (hosted DB does not auto-apply)

| Status | Migration | Effect |
|---|---|---|
| ⚠️ | `20260805120000_prelaunch_security_grants.sql` | Revoke `list_admin_emails()` / `resolve_agent_auth_alerts()` from `authenticated`. Apply and confirm — I could not verify it landed (needs an authenticated JWT to test). |
| ❌ | `20260724120000_lemonsqueezy_provider.sql` | Adds `subscriptions.provider` / `ls_*` columns + `claim_lifetime_seat_ls`. Also fixes the `useEntitlements` query that 400s on `ls_customer_id`. Before go-live, verify `claim_lifetime_seat_ls` isn't using `SELECT count(*) … FOR UPDATE` (invalid). |
| ❌ | `20260522000001_public_demo_rate_limits.sql` | Backing table for the anonymous "Ask AI" demo rate limiter — absent in prod, so `nl-search-public` currently has no working limit. |

## Secrets / config

| Status | Item | Note |
|---|---|---|
| ❌ | `CRON_HEARTBEAT_SECRET` (Supabase Edge Functions → Secrets) | Set to the same value as the GitHub secret. Until then the heartbeat workflow keeps failing. GitHub side already set. |
| ❌ | `DEMO_COOKIE_SECRET` / `DEMO_IP_SALT` | Set before promoting the public demo — they fall back to a value published in this public repo. |
| ⏸ | `VITE_PAYMENTS_LIVE` | Keep `false` until the Lemon Squeezy bundle above is deployed and a sandbox purchase round-trips. |

## Data cleanup

| Status | Item |
|---|---|
| ✅ | `value_usd` 1000× inflation — reconciled in prod (top values now match labels) |
| ✅ | `confidence ≤ 1` rows — fixed in prod (count now 0) |
| ❌ | Re-run `ebrd-ingest-agent` after redeploy so the sanitized confidence is recomputed (the SQL floor was cosmetic; originals were integer-truncated) |
| ❌ | One currency slip: "South Africa Freight Rail Expansion" stores `value_usd = 2e12` from a "R2 Trillion" (Rand) label ≈ $110B USD |

## Open code findings — Tier 2 / 3 (not yet fixed)

Confirmed by the audit; scoped out of the Tier-1 PR (#4). File:line references.

| Sev | Finding | Location |
|---|---|---|
| Med | `send-transactional-email` hard-requires the service-role key but is invoked from the browser (contact form / verification email path) | `supabase/functions/send-transactional-email/index.ts:49` |
| Med | "Mark as read" is a no-op for non-staff (RLS is staff-only and `alerts.read` is global) — needs a per-user read-state table | `src/hooks/use-alerts.ts:143` |
| Med | PDF export not gated to the Pro plan — free/Starter can download Pro-only reports | `src/hooks/useEntitlements.ts:229` |
| Med | Companion tables (stakeholders/milestones/evidence/contacts) fetched with no `.range()`, capped at 1000 — detail vanishes past row 1000 | `src/hooks/use-projects.ts:160` |
| Med | Email unsubscribe links broken in prod (`VITE_SUPABASE_URL` undefined in the bundle) | `src/pages/Unsubscribe.tsx:7` |
| Med | GDPR "Export my data" downloads the marketing homepage HTML | `src/lib/billing/paddleClient.ts:54` |
| Med | Public `/snapshot` + homepage pipeline total summed from a truncated 1000-row set | `supabase/functions/public-stats/index.ts:34` |
| Med | Browser-only signup anti-abuse — unlimited free trial accounts / pilot-seat burn | `src/pages/Login.tsx:85` |
| Low | CSV export writes cells unescaped — formula injection + malformed rows | `src/pages/dashboard/Projects.tsx:210` |
| Low | Hero card hardcodes `status: 'Verified'` on every project regardless of DB status | `src/components/home/HeroSection.tsx:25` |
| Low | `aiib-ingest-agent` mis-regions Azerbaijan/Georgia/Armenia as MENA; defaults unmatched to South Asia | `supabase/functions/aiib-ingest-agent/index.ts:64` |
| Low | `track-event` accepts unauthenticated service-role inserts with no rate limit | `supabase/functions/track-event/index.ts:103` |
| Low | Three agents insert AI alerts without `origin='ai_agent'`, so the "AI · unverified" badge never shows | `supabase/functions/update-checker/index.ts:149` |

## Done (2026-08-05)

- PR #3 — cron-heartbeat auth fix (merged).
- PR #4 — Tier-1 fixes: central ingest sanitizer, `value` alias, capped-plan
  pagination, Save-to-Review / ProjectEditor false-success guards, de-inverted
  `isLiveCheckoutEnabled`, security-grants migration (merged; prod deploy green).
