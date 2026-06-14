-- Fix: try_consume_quota / consume_quota reference usage_counters.updated_at,
-- but that column is missing in environments where the table was first created
-- by 20260329200000_stripe_billing.sql (which has no updated_at). The later
-- 20260422093359 migration's `CREATE TABLE IF NOT EXISTS ... updated_at ...`
-- is a no-op when the table already exists, so the column was never added.
--
-- Without this column the quota RPC errors at runtime (Postgres 42703), the AI
-- entitlement gate fails closed, and EVERY non-staff/non-bypass user is blocked
-- from all AI features with a 402. This adds the column idempotently so the
-- atomic quota counters work as designed.
ALTER TABLE public.usage_counters
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
