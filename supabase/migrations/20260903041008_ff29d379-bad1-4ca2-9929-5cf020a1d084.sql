CREATE TABLE public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Scheduled intelligence brief',
  report_type text NOT NULL DEFAULT 'weekly_market_snapshot',
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  cadence text NOT NULL DEFAULT 'monthly',
  next_run_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT ALL ON public.report_schedules TO service_role;

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own report schedules"
  ON public.report_schedules FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_report_schedules_due ON public.report_schedules (enabled, next_run_at);
CREATE INDEX idx_report_schedules_user ON public.report_schedules (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_report_schedule_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_report_schedules_updated_at
  BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_report_schedule_updated_at();