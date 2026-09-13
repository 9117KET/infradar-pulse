CREATE TABLE public.user_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'My Analyst',
  enabled boolean NOT NULL DEFAULT true,
  regions text[] NOT NULL DEFAULT '{}',
  sectors text[] NOT NULL DEFAULT '{}',
  stages text[] NOT NULL DEFAULT '{}',
  countries text[] NOT NULL DEFAULT '{}',
  min_value_usd numeric,
  tracked_only boolean NOT NULL DEFAULT false,
  cadence text NOT NULL DEFAULT 'weekly',
  channels text[] NOT NULL DEFAULT '{inapp}',
  include_report boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  run_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_agents_cadence_check CHECK (cadence IN ('daily','weekly'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_agents TO authenticated;
GRANT ALL ON public.user_agents TO service_role;
ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own analyst" ON public.user_agents
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages analysts" ON public.user_agents
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_user_agents_due ON public.user_agents (next_run_at) WHERE enabled;

CREATE TABLE public.user_agent_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.user_agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_agent_questions TO authenticated;
GRANT ALL ON public.user_agent_questions TO service_role;
ALTER TABLE public.user_agent_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own analyst questions" ON public.user_agent_questions
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages analyst questions" ON public.user_agent_questions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_user_agent_questions_agent ON public.user_agent_questions (agent_id) WHERE enabled;

CREATE TABLE public.user_agent_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.user_agents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question_id uuid REFERENCES public.user_agent_questions(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'brief',
  title text NOT NULL,
  summary text,
  body text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  feedback smallint,
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_agent_briefings_kind_check CHECK (kind IN ('brief','watch','answer','report')),
  CONSTRAINT user_agent_briefings_feedback_check CHECK (feedback IS NULL OR feedback IN (-1, 1))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_agent_briefings TO authenticated;
GRANT ALL ON public.user_agent_briefings TO service_role;
ALTER TABLE public.user_agent_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own briefings" ON public.user_agent_briefings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own briefings" ON public.user_agent_briefings
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own briefings" ON public.user_agent_briefings
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages briefings" ON public.user_agent_briefings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_user_agent_briefings_user_created ON public.user_agent_briefings (user_id, created_at DESC);

CREATE TRIGGER update_user_agents_updated_at BEFORE UPDATE ON public.user_agents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER update_user_agent_questions_updated_at BEFORE UPDATE ON public.user_agent_questions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Service-role only: pick the analysts whose next run is due.
CREATE OR REPLACE FUNCTION public.due_user_agents(p_limit integer DEFAULT 20)
RETURNS SETOF public.user_agents
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.user_agents
  WHERE enabled AND next_run_at <= now()
  ORDER BY next_run_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 20), 200));
$$;

REVOKE ALL ON FUNCTION public.due_user_agents(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.due_user_agents(integer) TO service_role;
