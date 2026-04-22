-- Quota requests: lets users ask for temporary daily allowance bumps
-- when they hit server-enforced limits (export, insight reads, AI).
CREATE TABLE public.quota_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  metric text NOT NULL CHECK (metric IN ('export_csv','export_pdf','insight_read','ai_generation')),
  current_plan text NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quota_requests_user ON public.quota_requests(user_id, created_at DESC);
CREATE INDEX idx_quota_requests_status ON public.quota_requests(status, created_at DESC);

ALTER TABLE public.quota_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own quota requests"
  ON public.quota_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users view own quota requests"
  ON public.quota_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all quota requests"
  ON public.quota_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update quota requests"
  ON public.quota_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rate limit: don't allow more than one pending request per user per metric
CREATE UNIQUE INDEX idx_quota_requests_one_pending
  ON public.quota_requests(user_id, metric)
  WHERE status = 'pending';