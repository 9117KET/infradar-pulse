

# Wire Up Subscriptions Properly Using Lovable's Built-In Payments (Paddle)

## Current State (broken)

The codebase ships a **custom bring-your-own-Stripe-key** integration (`create-checkout-session`, `create-portal-session`, `stripe-webhook` edge functions + `stripe_customers` / `subscriptions` / `usage_counters` tables). It is wired into the Pricing page, the Settings → Billing tab, and the `UpgradeDialog`.

Problem: **none of the required Stripe secrets are set** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`, `VITE_STRIPE_PRICE_STARTER` are all empty. Every "Start trial" / "Subscribe" / "Manage subscription" button currently throws. The `stripe-webhook` function rejects requests with `STRIPE_WEBHOOK_SECRET not set`. The Pro tier on Pricing has no checkout button at all (it shows "Contact us"), even though limits exist for it.

## Recommendation: Lovable's built-in **Paddle** payments

Per the eligibility check, this product (B2B SaaS market intelligence) is a clean fit for **Paddle**, Lovable's seamless Merchant of Record provider. This gives you:

- A test (sandbox) environment immediately — no Paddle account needed to start
- Tax (VAT/GST/sales tax), invoicing, fraud, refunds, and chargebacks handled automatically
- Customer billing portal out of the box
- Pricing: 5% + $0.50 per transaction, all-inclusive

After approval, Lovable enables Paddle and provides the wiring knowledge for products, checkout, and webhooks. Subscriptions sync into a managed table — no need to keep `stripe_customers`, the bespoke `stripe-webhook` function, or the empty `STRIPE_*` env contract.

## What changes

### 1. Enable Paddle (built-in)
Call `payments--enable_paddle_payments` after your approval. This provisions the integration and a sandbox environment.

### 2. Recreate the 3 paid plans in Paddle (matching the Pricing page)

| Tier | Price | Trial | Plan key | Daily caps (already enforced) |
|---|---|---|---|---|
| Starter | $29 / month | 3 days | `starter` | 20 AI · 20 exports · 50 reads |
| Pro | $199 / month | 3 days | `pro` | 100 AI · 100 exports · 200 reads |
| Enterprise | Contact sales | — | `enterprise` | unlimited (existing in code) |

Free stays as the unauthenticated default plan (`free`: 2 AI · 1 export · 3 reads). Enterprise stays sales-led (no checkout button — keeps "Contact sales"). I'll create Starter + Pro as Paddle products via the post-enable batch tool.

### 3. Replace the broken Stripe edge functions with Paddle-aware ones

| Action | File |
|---|---|
| Delete | `supabase/functions/create-checkout-session/index.ts` |
| Delete | `supabase/functions/create-portal-session/index.ts` |
| Delete | `supabase/functions/stripe-webhook/index.ts` |
| Create | `supabase/functions/paddle-checkout/index.ts` — returns a Paddle checkout URL for a given `planKey` (`starter` \| `pro`), tagged with `customData.supabase_user_id` |
| Create | `supabase/functions/paddle-portal/index.ts` — returns the Paddle customer portal URL for the signed-in user |
| Create | `supabase/functions/paddle-webhook/index.ts` — verifies Paddle signature; on `subscription.created/updated/canceled`, upserts `subscriptions` with `plan_key`, `status`, `current_period_end`, `trial_end`, `cancel_at_period_end` |

The existing `subscriptions` and `usage_counters` tables stay — they are the right shape and already drive `entitlementCheck.ts` server-side and `useEntitlements()` client-side. Only `stripe_customers` becomes a `paddle_customers` table (or we just store `paddle_customer_id` on `subscriptions`). I'll do the latter via migration to keep things simple: add `paddle_customer_id text` and `paddle_subscription_id text` to `subscriptions`, drop the unused `stripe_customers` table.

### 4. Fix `_shared/billing.ts`
Replace `resolvePlanKeyFromPriceId` with `resolvePlanKeyFromPaddlePriceId` that reads `PADDLE_PRICE_STARTER` / `PADDLE_PRICE_PRO` (auto-injected by the Paddle integration) instead of the empty `STRIPE_PRICE_*` envs.

### 5. Rewrite the client billing layer

| Action | File |
|---|---|
| Modify | `src/lib/billing/stripeClient.ts` → rename to `paddleClient.ts`; export `startCheckout(planKey)` and `openCustomerPortal()` calling the new edge functions |
| Modify | `src/pages/Pricing.tsx` — Starter button calls `startCheckout('starter')`; **add a working Pro "Start trial" button** calling `startCheckout('pro')`; Enterprise stays "Contact sales" |
| Modify | `src/pages/dashboard/Settings.tsx` (`BillingTab`) — replace single Stripe button with two upgrade buttons (Starter, Pro) plus a "Manage subscription" portal button visible when the user has any Paddle subscription record. Drop all `VITE_STRIPE_PRICE_STARTER` references. |
| Modify | `src/components/billing/UpgradeDialog.tsx` — defaults the trial CTA to Starter via `startCheckout('starter')`; drops the env-var dependency |
| Modify | `src/hooks/useEntitlements.ts` — read `paddle_customer_id` from the new column instead of querying the deleted `stripe_customers` table |

### 6. Tidy
- Remove the dead `STRIPE_*` and `VITE_STRIPE_PRICE_*` lines from `.env.example` (replace with comments noting Paddle keys are managed automatically)
- Keep `entitlementCheck.ts`, `PLAN_LIMITS`, staff bypass, and the `usage_counters` daily-cap system exactly as-is — they already work and gate every agent / export / insight read consistently

## End-to-end flow after this work
1. User clicks **Start trial** on `/pricing` (Starter or Pro) → `paddle-checkout` returns a Paddle checkout URL → user pays → returned to `/dashboard/settings?tab=billing`.
2. Paddle posts to `paddle-webhook` → `subscriptions` row upserted with the right `plan_key`.
3. `useEntitlements()` picks up the new plan; `entitlementCheck.ts` lifts the daily caps server-side on the next AI/export/insight call.
4. **Manage subscription** opens the Paddle customer portal for plan changes / cancellation / invoices.

## Files summary

| Action | File |
|---|---|
| Enable | Lovable Paddle integration (`payments--enable_paddle_payments`) |
| Create products | Paddle Starter $29/mo (3-day trial) + Pro $199/mo (3-day trial) |
| Migration | Add `paddle_customer_id`, `paddle_subscription_id` to `subscriptions`; drop `stripe_customers` table |
| Delete | 3 Stripe edge functions |
| Create | 3 Paddle edge functions |
| Modify | `_shared/billing.ts`, `stripeClient.ts → paddleClient.ts`, `Pricing.tsx`, `Settings.tsx`, `UpgradeDialog.tsx`, `useEntitlements.ts`, `.env.example` |

