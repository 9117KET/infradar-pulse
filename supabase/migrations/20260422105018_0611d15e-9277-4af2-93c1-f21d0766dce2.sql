
CREATE TABLE public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id text,
  paddle_customer_id text,
  event_type text NOT NULL,
  status text,
  plan_key text,
  environment text NOT NULL DEFAULT 'sandbox',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_events_user ON public.billing_events(user_id, occurred_at DESC);
CREATE INDEX idx_billing_events_sub ON public.billing_events(paddle_subscription_id);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own billing events"
  ON public.billing_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all billing events"
  ON public.billing_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages billing events"
  ON public.billing_events FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);
