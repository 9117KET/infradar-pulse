

## Goal

Restructure InfraRadar billing into a strategic, conversion-friendly funnel: **trials require a card**, **monthly + yearly (20% off) + lifetime** options exist, and the user is gracefully guided either to keep paying or step down — not silently dropped.

## New plan & price matrix

| Plan | Monthly | Yearly (save 20%) | Lifetime |
|---|---|---|---|
| **Starter** | $29/mo | $278/yr (~$23.20/mo) | — |
| **Pro** | $199/mo | $1,910/yr (~$159.20/mo) | **$1,499 one-time** (first 100 seats, "Founders") |
| **Enterprise** | Custom | Custom | — |
| **Free** | $0 (no card) | — | — |

Free trial: **3 days, card required**, only available on **Starter monthly** and **Pro monthly**. Yearly and Lifetime checkout immediately (no trial — they're already committed). Lifetime grants permanent Pro-tier access (`plan_key = 'lifetime'`, already in PLAN_LIMITS).

## Strategic UX (the "user-friendly" part)

1. **Trial sign-up always asks for card** — already enforced at the Paddle price level (`requires_payment_method: true`). At the end of the 3 days the card is auto-charged for the chosen plan (default Paddle behavior).
2. **Trial-end runway**: a new banner appears in-app starting **48h before trial ends** showing "Your trial ends in Xh — you'll be charged $29 for Starter on [date]. Switch plan, cancel, or keep going."
3. **Trial-ending email** sent 24h before via existing transactional email infra (`process-email-queue`) with one-click "Switch to yearly & save 20%", "Keep Starter", or "Cancel".
4. **If the card fails** at trial end → existing `subscription.past_due` flow already handles this (in-app alert + 3 retry attempts by Paddle) → access is preserved during the dunning grace period, then auto-downgrades to **Free** (read-only-quotas) instead of fully locking out — feature-gates on premium pages show an inline upgrade prompt.
5. **Yearly/Monthly toggle** on the public `/pricing` page; the Founders Lifetime card is shown alongside, with a live "X of 100 seats remaining" badge.
6. **In-Settings → Billing**, users can switch monthly ↔ yearly anytime (proration handled by existing `paddle-change-plan`), and upgrade to Lifetime with a one-click button. Lifetime cancels their recurring sub at period end automatically.

## Implementation plan

### 1. Paddle catalog (sandbox; auto-syncs to live on publish)

Create five new prices on the existing two products + one new product:

- `starter_yearly` on Starter product → $278/yr, **no trial** (yearly buyers skip trial)
- `pro_yearly` on Pro product → $1,910/yr, **no trial**
- New product `lifetime_pro` ("InfraRadar Pro — Lifetime, Founders") with one-time price `lifetime_pro_onetime` → $1,499 USD, non-recurring

(Monthly trial-bearing prices `starter_monthly` / `pro_monthly` stay as-is.)

### 2. Database migration

- Extend `subscriptions.plan_key` to accept `'lifetime'` (already in app enum, just ensure no DB CHECK blocks it).
- Add `lifetime_grants` table — `(user_id, environment, paddle_transaction_id, granted_at)`. One row = lifetime access, never expires.
- Add `seat_counter` table or use a `lifetime_seat_no` column to enforce/track the 100-seat limit, plus a small RPC `claim_lifetime_seat()` that atomically returns the next seat number or fails if 100 are taken.
- Update `has_active_subscription()` to also return true if a row exists in `lifetime_grants` for that user+env.

### 3. Edge functions

- `payments-webhook`: extend `PRICE_TO_PLAN` map to include the new external_ids (`starter_yearly → starter`, `pro_yearly → pro`, `lifetime_pro_onetime → lifetime`). On `transaction.completed` for the lifetime price, insert a `lifetime_grants` row + claim a seat.
- `checkout-precheck`: also block trial CTA when the user already has a lifetime grant (they shouldn't see "Start trial").
- `paddle-change-plan`: accept the new yearly priceIds.
- New `claim-lifetime-seat` (or wire into webhook only) — webhook is safer; it uses verified Paddle data.
- New `trial-ending-notifier` cron edge function: runs hourly, finds subs whose `trial_end` is 24–25h away and enqueues the trial-ending email.

### 4. Frontend

- `src/lib/billing/limits.ts` + `_shared/billing.ts`: add yearly price keys; ensure `lifetime` in `effectivePlan()` returns `'lifetime'` when a `lifetime_grants` row exists (fetch alongside subscription).
- `src/hooks/usePaddleCheckout.ts`: extend `PlanPriceId` union with `'starter_yearly' | 'pro_yearly' | 'lifetime_pro_onetime'`.
- `src/pages/Pricing.tsx`: redesign with **Monthly / Yearly toggle** (saves 20% badge), 4-card grid (Free / Starter / Pro / Enterprise), and a separate **"Founders Lifetime — $1,499"** highlighted card below with seats-remaining counter and "Pay once, own it forever" copy.
- New `src/components/billing/TrialEndingBanner.tsx`: shows in `DashboardLayout` when trial < 48h remaining.
- `src/pages/dashboard/Settings.tsx` Billing tab: add "Switch to yearly (save 20%)" CTA when on monthly, "Upgrade to Lifetime" CTA when on Pro, and clearer trial countdown.

### 5. Transactional email

Add `trial-ending` template to `_shared/transactional-email-templates/registry.ts` with the three CTAs (switch yearly, keep current, cancel).

### 6. QA / rollout

- Test in preview with sandbox card `4242 4242 4242 4242` → trial → fast-forward billing → auto-charge.
- Test card `4000 0027 6000 3184` → trial → renewal declines → past_due alert → graceful Free downgrade.
- Test yearly checkout (no trial, immediate charge).
- Test lifetime checkout → seat claimed → `lifetime_grants` row created → user has unlimited access permanently.
- Verify pricing page on mobile (1194px viewport already tested OK).
- Publish so live Paddle catalog syncs.

## What stays the same

- Paddle webhook signature verification, RLS on subscriptions, environment splitting (sandbox vs live), trial anti-abuse table, all existing entitlement enforcement code paths.
- Free tier (no card) — still the top-of-funnel.

## What this fixes / enables

- No more "free trial without commitment" abandonment — card on file = ~3-4x conversion.
- Yearly plan unlocks higher LTV up front and reduces churn.
- Lifetime offer creates urgency (100 seats), generates immediate cash, and doubles as marketing collateral ("our first 100 customers got it for life").
- Past-due downgrade to Free (instead of full lockout) keeps users in the ecosystem so they can come back.

