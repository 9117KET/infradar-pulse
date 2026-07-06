
-- 20260609000001 project_health_score
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS health_score integer DEFAULT NULL CHECK (health_score >= 0 AND health_score <= 100),
  ADD COLUMN IF NOT EXISTS delay_probability numeric(4,3) DEFAULT NULL CHECK (delay_probability >= 0 AND delay_probability <= 1),
  ADD COLUMN IF NOT EXISTS health_scored_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_signals jsonb DEFAULT NULL;

CREATE TABLE IF NOT EXISTS project_health_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  health_score integer NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  delay_probability numeric(4,3) NOT NULL CHECK (delay_probability >= 0 AND delay_probability <= 1),
  signals jsonb DEFAULT NULL,
  scored_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_health_history TO authenticated;
GRANT ALL ON public.project_health_history TO service_role;
CREATE INDEX IF NOT EXISTS idx_health_history_project ON project_health_history(project_id, scored_at DESC);
ALTER TABLE project_health_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "health_history_read" ON project_health_history;
CREATE POLICY "health_history_read" ON project_health_history FOR SELECT USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.approved = true));
DROP POLICY IF EXISTS "health_history_insert_service" ON project_health_history;
CREATE POLICY "health_history_insert_service" ON project_health_history FOR INSERT WITH CHECK (true);

ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS description text;
INSERT INTO agent_config (agent_type, enabled, description)
VALUES ('health-scoring', true, 'Computes per-project health score and delay probability from multi-signal analysis')
ON CONFLICT (agent_type) DO NOTHING;

-- 20260609000002 contractor_intelligence
CREATE TABLE IF NOT EXISTS contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  country text, region text, sectors text[] DEFAULT '{}',
  website text, description text,
  total_awards integer DEFAULT 0,
  total_award_value_usd bigint DEFAULT 0,
  last_award_at timestamptz,
  distress_score integer DEFAULT 0 CHECK (distress_score >= 0 AND distress_score <= 100),
  distress_signals jsonb DEFAULT '[]',
  distress_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(normalized_name)
);
GRANT SELECT ON public.contractors TO authenticated;
GRANT ALL ON public.contractors TO service_role;

CREATE TABLE IF NOT EXISTS contractor_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_name text NOT NULL,
  award_value_usd bigint,
  award_date date,
  contract_type text,
  source_alert_id uuid REFERENCES alerts(id) ON DELETE SET NULL,
  source_url text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contractor_awards TO authenticated;
GRANT ALL ON public.contractor_awards TO service_role;

CREATE INDEX IF NOT EXISTS idx_contractors_name ON contractors(normalized_name);
CREATE INDEX IF NOT EXISTS idx_contractors_distress ON contractors(distress_score DESC);
CREATE INDEX IF NOT EXISTS idx_contractor_awards_contractor ON contractor_awards(contractor_id, award_date DESC);
CREATE INDEX IF NOT EXISTS idx_contractor_awards_project ON contractor_awards(project_id);

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contractors_read" ON contractors;
CREATE POLICY "contractors_read" ON contractors FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "contractor_awards_read" ON contractor_awards;
CREATE POLICY "contractor_awards_read" ON contractor_awards FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "contractors_service_write" ON contractors;
CREATE POLICY "contractors_service_write" ON contractors FOR ALL USING (true);
DROP POLICY IF EXISTS "contractor_awards_service_write" ON contractor_awards;
CREATE POLICY "contractor_awards_service_write" ON contractor_awards FOR ALL USING (true);

INSERT INTO agent_config (agent_type, enabled, description)
VALUES ('contractor-intel', true, 'Aggregates contractor entities from tender awards and monitors for financial distress signals')
ON CONFLICT (agent_type) DO NOTHING;

-- 20260609000003 tender_events_table
CREATE TABLE IF NOT EXISTS tender_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_name text NOT NULL,
  country text, region text, sector text,
  event_type text NOT NULL CHECK (event_type IN ('award','tender_open','cancellation','re_tender','dispute','arbitration')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  summary text NOT NULL,
  award_value_usd bigint,
  contractor_name text,
  deadline date,
  agency text,
  source_url text,
  source_alert_id uuid REFERENCES alerts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tender_events TO authenticated;
GRANT ALL ON public.tender_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_tender_events_project ON tender_events(project_id);
CREATE INDEX IF NOT EXISTS idx_tender_events_type ON tender_events(event_type);
CREATE INDEX IF NOT EXISTS idx_tender_events_created ON tender_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tender_events_country ON tender_events(country);
CREATE INDEX IF NOT EXISTS idx_tender_events_severity ON tender_events(severity);

ALTER TABLE tender_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tender_events_read" ON tender_events;
CREATE POLICY "tender_events_read" ON tender_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tender_events_service_write" ON tender_events;
CREATE POLICY "tender_events_service_write" ON tender_events FOR ALL USING (true);

INSERT INTO tender_events (project_id, project_name, country, event_type, severity, summary, source_url, source_alert_id, created_at)
SELECT a.project_id, COALESCE(a.project_name,'Unknown'), NULL,
  lower(CASE
    WHEN a.message ILIKE 'Contract: award%' THEN 'award'
    WHEN a.message ILIKE 'Contract: tender_open%' THEN 'tender_open'
    WHEN a.message ILIKE 'Contract: cancellation%' THEN 'cancellation'
    WHEN a.message ILIKE 'Contract: re_tender%' THEN 're_tender'
    WHEN a.message ILIKE 'Contract: dispute%' THEN 'dispute'
    WHEN a.message ILIKE 'Contract: arbitration%' THEN 'arbitration'
    ELSE 'award' END),
  a.severity,
  regexp_replace(a.message, '^Contract:\s*(award|tender_open|cancellation|re_tender|dispute|arbitration)\s*—\s*', '', 'i'),
  a.source_url, a.id, a.created_at
FROM alerts a
WHERE a.message ILIKE 'Contract:%'
  AND NOT EXISTS (SELECT 1 FROM tender_events te WHERE te.source_alert_id = a.id);

-- 20260609000004 admin_lifetime_grant
ALTER TABLE public.lifetime_grants
  ADD COLUMN IF NOT EXISTS grant_source text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS granted_by uuid;

-- 20260609000005 fix_lifetime_seat_functions
CREATE OR REPLACE FUNCTION public.lifetime_seats_taken(p_environment text DEFAULT 'live')
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::integer FROM public.lifetime_grants
  WHERE environment = p_environment AND seat_number IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.claim_lifetime_seat(
  p_user_id uuid, p_environment text, p_paddle_transaction_id text, p_paddle_customer_id text, p_max_seats integer DEFAULT 100
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing integer; v_taken integer; v_seat integer;
BEGIN
  SELECT seat_number INTO v_existing FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = p_environment;
  IF FOUND THEN RETURN v_existing; END IF;
  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants WHERE environment = p_environment FOR UPDATE;
  IF v_taken >= p_max_seats THEN
    INSERT INTO public.lifetime_grants (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
    VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, NULL);
    RETURN NULL;
  END IF;
  SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat FROM public.lifetime_grants WHERE environment = p_environment;
  INSERT INTO public.lifetime_grants (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
  VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, v_seat);
  RETURN v_seat;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_grant_lifetime_access(p_user_id uuid, p_environment text DEFAULT 'live')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_taken integer; v_seat integer; v_existing public.lifetime_grants%ROWTYPE; v_max_seats integer := 100;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023'; END IF;
  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants WHERE environment = COALESCE(p_environment,'live') FOR UPDATE;
  SELECT * INTO v_existing FROM public.lifetime_grants WHERE user_id = p_user_id AND environment = COALESCE(p_environment,'live');
  IF FOUND THEN
    RETURN jsonb_build_object('granted',true,'reason','existing','seat_number',v_existing.seat_number,'grant_source',v_existing.grant_source);
  END IF;
  IF v_taken < v_max_seats THEN
    SELECT COALESCE(MAX(seat_number),0)+1 INTO v_seat FROM public.lifetime_grants WHERE environment = COALESCE(p_environment,'live');
  ELSE v_seat := NULL; END IF;
  INSERT INTO public.lifetime_grants (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number, grant_source, granted_by)
  VALUES (p_user_id, COALESCE(p_environment,'live'), NULL, NULL, v_seat, 'admin', v_admin)
  RETURNING * INTO v_existing;
  RETURN jsonb_build_object('granted',true,'reason','created','seat_number',v_existing.seat_number);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_lifetime_access(p_user_id uuid, p_environment text DEFAULT 'live')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_seat integer;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.lifetime_grants WHERE user_id = p_user_id AND environment = COALESCE(p_environment,'live') RETURNING seat_number INTO v_seat;
  IF NOT FOUND THEN RETURN jsonb_build_object('revoked',false,'reason','no_grant'); END IF;
  RETURN jsonb_build_object('revoked',true,'seat_number',v_seat);
END; $$;

REVOKE ALL ON FUNCTION public.admin_grant_lifetime_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_lifetime_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_lifetime_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lifetime_access(uuid, text) TO authenticated;

-- 20260612090000 alert_origin
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'system';
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_origin_check;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_origin_check CHECK (origin IN ('system','ai_agent','human'));

-- 20260614120000 fix_usage_counters_updated_at
ALTER TABLE public.usage_counters ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 20260614130000 report_shares
CREATE TABLE IF NOT EXISTS public.report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_shares TO authenticated;
GRANT ALL ON public.report_shares TO service_role;
CREATE INDEX IF NOT EXISTS idx_report_shares_token ON public.report_shares(token);
CREATE INDEX IF NOT EXISTS idx_report_shares_owner ON public.report_shares(created_by, report_run_id);
ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners manage own report_shares" ON public.report_shares;
CREATE POLICY "owners manage own report_shares" ON public.report_shares FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.create_report_share(p_report_run_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.report_runs WHERE id = p_report_run_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE = 'P0001'; END IF;
  SELECT token INTO v_token FROM public.report_shares WHERE report_run_id = p_report_run_id AND created_by = auth.uid() AND NOT revoked LIMIT 1;
  IF v_token IS NULL THEN
    INSERT INTO public.report_shares (report_run_id, created_by) VALUES (p_report_run_id, auth.uid()) RETURNING token INTO v_token;
  END IF;
  RETURN v_token;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_report_share(p_report_run_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.report_shares SET revoked = true WHERE report_run_id = p_report_run_id AND created_by = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_shared_report(p_token text)
RETURNS TABLE(title text, markdown text, report_type text, citations jsonb, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.title, r.markdown, r.report_type, r.citations, r.created_at
  FROM public.report_shares s JOIN public.report_runs r ON r.id = s.report_run_id
  WHERE s.token = p_token AND s.revoked = false AND r.status = 'completed' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.create_report_share(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_report_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_report_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_report_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;

-- 20260615000001 increment_demo_quota (references public_demo_rate_limits table — plpgsql, deferred check)
CREATE OR REPLACE FUNCTION public.increment_demo_quota(p_ip_hash text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_count integer;
BEGIN
  INSERT INTO public.public_demo_rate_limits (ip_hash, query_date, count)
  VALUES (p_ip_hash, current_date, 1)
  ON CONFLICT (ip_hash, query_date) DO UPDATE SET count = public.public_demo_rate_limits.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END; $$;
REVOKE ALL ON FUNCTION public.increment_demo_quota(text) FROM public;
REVOKE ALL ON FUNCTION public.increment_demo_quota(text) FROM anon;
REVOKE ALL ON FUNCTION public.increment_demo_quota(text) FROM authenticated;

-- 20260615120000 referral_bonus
CREATE OR REPLACE FUNCTION public.qualified_referral_count(p_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.referral_events re
  WHERE re.referrer_id = p_user_id AND re.reward_status <> 'revoked'
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = re.referred_id AND u.email_confirmed_at IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.referral_ai_bonus(p_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT LEAST(public.qualified_referral_count(p_user_id) * 3, 30);
$$;

CREATE OR REPLACE FUNCTION public.referred_welcome_bonus(p_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.referral_events re
    WHERE re.referred_id = p_user_id AND re.reward_status <> 'revoked'
      AND re.created_at > now() - interval '14 days') THEN 3 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.my_referral_summary()
RETURNS TABLE(qualified_count int, pending_count int, ai_bonus int, welcome_bonus int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.qualified_referral_count(auth.uid()),
    GREATEST((SELECT count(*)::int FROM public.referral_events WHERE referrer_id = auth.uid() AND reward_status <> 'revoked') - public.qualified_referral_count(auth.uid()), 0),
    public.referral_ai_bonus(auth.uid()), public.referred_welcome_bonus(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.mark_referral_qualified(p_referred_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.referral_events SET reward_status = 'awarded'
  WHERE referred_id = p_referred_user_id AND reward_status = 'pending';
END; $$;

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_status ON public.referral_events(referrer_id, reward_status);
REVOKE ALL ON FUNCTION public.qualified_referral_count(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.referral_ai_bonus(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.referred_welcome_bonus(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_referral_qualified(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_referral_summary() TO authenticated;

-- 20260615130000 plan_interest
CREATE TABLE IF NOT EXISTS public.plan_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  plan_key text NOT NULL,
  billing_cycle text,
  sentiment text NOT NULL,
  expected_price integer,
  expected_currency text DEFAULT 'USD',
  note text,
  source text,
  current_plan text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_interest_sentiment_chk CHECK (sentiment IN ('ready','maybe','curious'))
);
GRANT SELECT, INSERT ON public.plan_interest TO anon, authenticated;
GRANT ALL ON public.plan_interest TO service_role;
CREATE INDEX IF NOT EXISTS idx_plan_interest_created_at ON public.plan_interest(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_interest_user_id ON public.plan_interest(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_interest_plan_sentiment ON public.plan_interest(plan_key, sentiment);
ALTER TABLE public.plan_interest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can register plan interest" ON public.plan_interest;
CREATE POLICY "Anyone can register plan interest" ON public.plan_interest FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
DROP POLICY IF EXISTS "Users read own plan interest" ON public.plan_interest;
CREATE POLICY "Users read own plan interest" ON public.plan_interest FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins read all plan interest" ON public.plan_interest;
CREATE POLICY "Admins read all plan interest" ON public.plan_interest FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
DROP POLICY IF EXISTS "Service role manages plan interest" ON public.plan_interest;
CREATE POLICY "Service role manages plan interest" ON public.plan_interest FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.user_events ADD COLUMN IF NOT EXISTS country text;

-- 20260616120000 restore anon grant on seats
GRANT EXECUTE ON FUNCTION public.lifetime_seats_taken(text) TO anon;

-- 20260619000000 health_scoring_cron
DO $$
DECLARE base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1'; svc_key TEXT := current_setting('app.service_role_key', true); auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    RAISE NOTICE 'app.service_role_key not set - skipping health-scoring cron.'; RETURN;
  END IF;
  auth_hdr := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || svc_key);
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('infradar-health-scoring');
  PERFORM cron.schedule('infradar-health-scoring','40 */6 * * *',
    format($q$SELECT net.http_post(url:='%s/health-score-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$, base_url, auth_hdr));
END; $$;

-- 20260619120000 outreach (bd_partner_id FK dropped — bd_partners does not exist)
CREATE TABLE IF NOT EXISTS public.outreach_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, org text, role text, email text, linkedin_url text,
  persona text NOT NULL DEFAULT 'infra_pe',
  wave integer NOT NULL DEFAULT 1,
  region text, sector text, source_url text,
  status text NOT NULL DEFAULT 'new',
  next_step integer NOT NULL DEFAULT 0,
  last_contacted_at timestamptz,
  bd_partner_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_prospects TO authenticated;
GRANT ALL ON public.outreach_prospects TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_prospects_email ON public.outreach_prospects (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_prospects_status ON public.outreach_prospects (status, persona, wave);
ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access on outreach_prospects" ON public.outreach_prospects;
CREATE POLICY "Admin full access on outreach_prospects" ON public.outreach_prospects
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.outreach_prospects(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  subject text, body text NOT NULL,
  scheduled_for timestamptz, sent_at timestamptz,
  generated_by text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_messages TO authenticated;
GRANT ALL ON public.outreach_messages TO service_role;
CREATE INDEX IF NOT EXISTS idx_outreach_messages_send ON public.outreach_messages (status, channel, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_prospect ON public.outreach_messages (prospect_id, step);
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access on outreach_messages" ON public.outreach_messages;
CREATE POLICY "Admin full access on outreach_messages" ON public.outreach_messages
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION public.touch_outreach_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS outreach_prospects_updated_at ON public.outreach_prospects;
CREATE TRIGGER outreach_prospects_updated_at BEFORE UPDATE ON public.outreach_prospects
  FOR EACH ROW EXECUTE FUNCTION public.touch_outreach_updated_at();
DROP TRIGGER IF EXISTS outreach_messages_updated_at ON public.outreach_messages;
CREATE TRIGGER outreach_messages_updated_at BEFORE UPDATE ON public.outreach_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_outreach_updated_at();

INSERT INTO public.agent_config (agent_type)
VALUES ('outreach_draft'), ('outreach_send'), ('weekly_signal')
ON CONFLICT (agent_type) DO NOTHING;

-- 20260619120100 outreach_cron
DO $$
DECLARE base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1'; svc_key TEXT := current_setting('app.service_role_key', true); auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    RAISE NOTICE 'app.service_role_key not set - skipping outreach cron.'; RETURN;
  END IF;
  auth_hdr := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || svc_key);
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('infradar-outreach-draft','infradar-outreach-send','infradar-weekly-signal');
  PERFORM cron.schedule('infradar-outreach-draft','15 6 * * *',
    format($q$SELECT net.http_post(url:='%s/outreach-draft-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$, base_url, auth_hdr));
  PERFORM cron.schedule('infradar-outreach-send','0 9-15/2 * * 1-5',
    format($q$SELECT net.http_post(url:='%s/outreach-send-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$, base_url, auth_hdr));
  PERFORM cron.schedule('infradar-weekly-signal','0 13 * * 1',
    format($q$SELECT net.http_post(url:='%s/weekly-signal-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$, base_url, auth_hdr));
END; $$;

-- 20260625120000 reject_candidate_rpc
DROP FUNCTION IF EXISTS public.reject_project_candidate(uuid, text);
DROP FUNCTION IF EXISTS public.reject_project_candidate(uuid);
CREATE OR REPLACE FUNCTION public.reject_project_candidate(p_candidate_id uuid, p_reason text DEFAULT 'Rejected from verification workbench')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_candidate public.project_candidates%ROWTYPE; v_performed_by uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_performed_by,'admin'::public.app_role) OR public.has_role(v_performed_by,'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023'; END IF;
  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RETURN jsonb_build_object('candidate_id',p_candidate_id,'rejected',true,'already_rejected',true);
  END IF;
  UPDATE public.project_candidates SET review_status = 'rejected', pipeline_status = 'rejected', updated_at = now() WHERE id = p_candidate_id;
  INSERT INTO public.review_actions (item_type, candidate_id, action, reason, performed_by)
  VALUES ('candidate', p_candidate_id, 'rejected', COALESCE(p_reason,''), v_performed_by);
  RETURN jsonb_build_object('candidate_id',p_candidate_id,'rejected',true,'already_rejected',false);
END; $$;
REVOKE ALL ON FUNCTION public.reject_project_candidate(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_project_candidate(uuid, text) TO authenticated;

-- 20260626120000 milestone_type_column
ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS milestone_type TEXT;

NOTIFY pgrst, 'reload schema';
