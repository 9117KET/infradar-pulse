-- Replay note: alert_rules (20260330140000), saved_searches (20260420000001)
-- and agent_config (20260331000001) are also created by earlier migrations.
-- Everything here is idempotent so fresh local replays don't fail.

-- 1. alert_rules table
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own alert rules" ON public.alert_rules;
CREATE POLICY "Users can view own alert rules" ON public.alert_rules
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert own alert rules" ON public.alert_rules;
CREATE POLICY "Users can insert own alert rules" ON public.alert_rules
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own alert rules" ON public.alert_rules;
CREATE POLICY "Users can update own alert rules" ON public.alert_rules
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own alert rules" ON public.alert_rules;
CREATE POLICY "Users can delete own alert rules" ON public.alert_rules
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_alert_rules_user_id ON public.alert_rules(user_id);

-- 2. saved_searches table
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own saved searches" ON public.saved_searches;
CREATE POLICY "Users can view own saved searches" ON public.saved_searches
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert own saved searches" ON public.saved_searches;
CREATE POLICY "Users can insert own saved searches" ON public.saved_searches
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own saved searches" ON public.saved_searches;
CREATE POLICY "Users can update own saved searches" ON public.saved_searches
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own saved searches" ON public.saved_searches;
CREATE POLICY "Users can delete own saved searches" ON public.saved_searches
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON public.saved_searches(user_id);

-- 3. agent_config table
CREATE TABLE IF NOT EXISTS public.agent_config (
  agent_type text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read agent config" ON public.agent_config;
CREATE POLICY "Anyone can read agent config" ON public.agent_config
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff can insert agent config" ON public.agent_config;
CREATE POLICY "Staff can insert agent config" ON public.agent_config
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher')
  );
DROP POLICY IF EXISTS "Staff can update agent config" ON public.agent_config;
CREATE POLICY "Staff can update agent config" ON public.agent_config
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher')
  );
DROP POLICY IF EXISTS "Admins can delete agent config" ON public.agent_config;
CREATE POLICY "Admins can delete agent config" ON public.agent_config
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. profiles notification preference columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_digest boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS critical_only boolean NOT NULL DEFAULT false;
