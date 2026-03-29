-- Stripe customer link, subscription mirror, usage counters for entitlements
CREATE TABLE public.stripe_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'inactive',
  price_id text,
  plan_key text NOT NULL DEFAULT 'free',
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_subscriptions_stripe_id ON public.subscriptions (stripe_subscription_id);

CREATE TABLE public.usage_counters (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  metric text NOT NULL,
  period_start date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, metric, period_start)
);

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own stripe customer"
  ON public.stripe_customers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users read own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users read own usage"
  ON public.usage_counters FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role (webhooks, edge functions) uses bypass; no insert policies for users on these tables

CREATE OR REPLACE FUNCTION public.increment_usage_metric(p_metric text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (timezone('utc', now()))::date;
  new_count int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  INSERT INTO public.usage_counters (user_id, metric, period_start, count)
  VALUES (uid, p_metric, today, 1)
  ON CONFLICT (user_id, metric, period_start)
  DO UPDATE SET count = public.usage_counters.count + 1
  RETURNING count INTO new_count;
  RETURN jsonb_build_object('ok', true, 'count', new_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_usage_metric(text) TO authenticated;

COMMENT ON TABLE public.subscriptions IS 'Mirrored from Stripe webhooks; plan_key: free|trialing|starter|pro|enterprise|lifetime';
COMMENT ON TABLE public.usage_counters IS 'Daily per-metric counts for entitlements (UTC date buckets).';
