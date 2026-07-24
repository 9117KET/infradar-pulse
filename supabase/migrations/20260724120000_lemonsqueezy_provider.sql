-- Add Lemon Squeezy as a second payment provider alongside (dormant) Paddle.
-- Paddle columns/constraints/RPCs are left fully intact; this migration only
-- relaxes two NOT NULLs so LS-only rows can exist and adds parallel ls_*
-- columns + a provider discriminator. See CLAUDE.md / go-to-market plan for
-- why: Paddle was never taken live, Lemon Squeezy is the new active processor.

-- 1. subscriptions: allow LS-only rows (no Paddle IDs on them)
ALTER TABLE public.subscriptions
  ALTER COLUMN paddle_subscription_id DROP NOT NULL,
  ALTER COLUMN paddle_customer_id DROP NOT NULL,
  ALTER COLUMN product_id DROP NOT NULL,
  ALTER COLUMN price_id DROP NOT NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS ls_subscription_id text,
  ADD COLUMN IF NOT EXISTS ls_customer_id text,
  ADD COLUMN IF NOT EXISTS ls_order_id text,
  ADD COLUMN IF NOT EXISTS ls_variant_id text,
  ADD COLUMN IF NOT EXISTS ls_product_id text;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_provider_check CHECK (provider IN ('paddle', 'lemonsqueezy'));

-- Plain unique index — Postgres treats every NULL as distinct, so Paddle rows
-- (ls_subscription_id IS NULL) and LS rows (paddle_subscription_id IS NULL)
-- never collide with each other or with the existing Paddle unique index.
-- Matches supabase-js .upsert(row, { onConflict: 'ls_subscription_id,environment' }).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_ls_env_unique
  ON public.subscriptions(ls_subscription_id, environment);

CREATE INDEX IF NOT EXISTS idx_subscriptions_ls_customer
  ON public.subscriptions(ls_customer_id) WHERE ls_customer_id IS NOT NULL;

-- 2. billing_events: mirror provider-agnostic columns (already-nullable table)
ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS ls_subscription_id text,
  ADD COLUMN IF NOT EXISTS ls_customer_id text,
  ADD COLUMN IF NOT EXISTS ls_order_id text;

CREATE INDEX IF NOT EXISTS idx_billing_events_ls_sub ON public.billing_events(ls_subscription_id);

-- 3. lifetime_grants: LS one-time "lifetime" purchases share the SAME 100-seat
--    pool as Paddle's (seat scarcity is cross-provider, not per-provider).
ALTER TABLE public.lifetime_grants
  ADD COLUMN IF NOT EXISTS ls_order_id text,
  ADD COLUMN IF NOT EXISTS ls_customer_id text;
-- grant_source already exists (added in 20260609000004) with default 'paddle';
-- LS-sourced rows will set grant_source = 'lemonsqueezy'.

-- 4. New RPC mirroring claim_lifetime_seat (see 20260609000005's MAX+1 fix and
--    FOR UPDATE lock scope), LS-flavored params, same shared seat pool per
--    environment so seat numbers stay globally unique regardless of provider.
CREATE OR REPLACE FUNCTION public.claim_lifetime_seat_ls(
  p_user_id uuid,
  p_environment text,
  p_ls_order_id text,
  p_ls_customer_id text,
  p_max_seats integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_taken integer;
  v_seat integer;
BEGIN
  SELECT seat_number INTO v_existing
  FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = p_environment;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants
  WHERE environment = p_environment FOR UPDATE;

  IF v_taken >= p_max_seats THEN
    INSERT INTO public.lifetime_grants
      (user_id, environment, ls_order_id, ls_customer_id, seat_number, grant_source)
    VALUES (p_user_id, p_environment, p_ls_order_id, p_ls_customer_id, NULL, 'lemonsqueezy');
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat
  FROM public.lifetime_grants
  WHERE environment = p_environment;

  INSERT INTO public.lifetime_grants
    (user_id, environment, ls_order_id, ls_customer_id, seat_number, grant_source)
  VALUES (p_user_id, p_environment, p_ls_order_id, p_ls_customer_id, v_seat, 'lemonsqueezy');
  RETURN v_seat;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_lifetime_seat_ls(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_lifetime_seat_ls(uuid, text, text, text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
