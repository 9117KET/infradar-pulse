
-- ============================================================
-- MIGRATION: 20260609000001_project_health_score.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Add health score and delay probability to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS health_score integer DEFAULT NULL CHECK (health_score >= 0 AND health_score <= 100),
  ADD COLUMN IF NOT EXISTS delay_probability numeric(4,3) DEFAULT NULL CHECK (delay_probability >= 0 AND delay_probability <= 1),
  ADD COLUMN IF NOT EXISTS health_scored_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_signals jsonb DEFAULT NULL;

-- Track health score history for trend charts
CREATE TABLE IF NOT EXISTS project_health_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  health_score integer NOT NULL CHECK (health_score >= 0 AND health_score <= 100),
  delay_probability numeric(4,3) NOT NULL CHECK (delay_probability >= 0 AND delay_probability <= 1),
  signals jsonb DEFAULT NULL,
  scored_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_history_project ON project_health_history(project_id, scored_at DESC);

ALTER TABLE project_health_history ENABLE ROW LEVEL SECURITY;

-- Users can read health history for approved projects
DROP POLICY IF EXISTS "health_history_read" ON project_health_history;
CREATE POLICY "health_history_read" ON project_health_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.approved = true
    )
  );

-- Service role (agents) can insert
DROP POLICY IF EXISTS "health_history_insert_service" ON project_health_history;
CREATE POLICY "health_history_insert_service" ON project_health_history
  FOR INSERT WITH CHECK (true);

-- Add agent_config entry for health-scoring agent
-- Replay safety: description was added to agent_config via the hosted
-- dashboard and never migrated; create it if missing.
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS description text;
INSERT INTO agent_config (agent_type, enabled, description)
VALUES ('health-scoring', true, 'Computes per-project health score and delay probability from multi-signal analysis')
ON CONFLICT (agent_type) DO NOTHING;

-- ============================================================
-- MIGRATION: 20260609000002_contractor_intelligence.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Contractor entity model for tracking firms that win infrastructure bids
CREATE TABLE IF NOT EXISTS contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  country text,
  region text,
  sectors text[] DEFAULT '{}',
  website text,
  description text,
  -- Aggregated award stats (updated by contractor-intel-agent)
  total_awards integer DEFAULT 0,
  total_award_value_usd bigint DEFAULT 0,
  last_award_at timestamptz,
  -- Financial distress signals
  distress_score integer DEFAULT 0 CHECK (distress_score >= 0 AND distress_score <= 100),
  distress_signals jsonb DEFAULT '[]',
  distress_updated_at timestamptz,
  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(normalized_name)
);

-- Individual award records linking contractors to projects/tenders
CREATE TABLE IF NOT EXISTS contractor_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_name text NOT NULL,
  award_value_usd bigint,
  award_date date,
  contract_type text, -- 'EPC', 'design', 'supervision', 'supply', etc.
  source_alert_id uuid REFERENCES alerts(id) ON DELETE SET NULL,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractors_name ON contractors(normalized_name);
CREATE INDEX IF NOT EXISTS idx_contractors_distress ON contractors(distress_score DESC);
CREATE INDEX IF NOT EXISTS idx_contractor_awards_contractor ON contractor_awards(contractor_id, award_date DESC);
CREATE INDEX IF NOT EXISTS idx_contractor_awards_project ON contractor_awards(project_id);

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_awards ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read contractors and awards
CREATE POLICY "contractors_read" ON contractors
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "contractor_awards_read" ON contractor_awards
  FOR SELECT TO authenticated USING (true);

-- Service role can write
CREATE POLICY "contractors_service_write" ON contractors
  FOR ALL USING (true);

CREATE POLICY "contractor_awards_service_write" ON contractor_awards
  FOR ALL USING (true);

-- Register agent
INSERT INTO agent_config (agent_type, enabled, description)
VALUES ('contractor-intel', true, 'Aggregates contractor entities from tender awards and monitors for financial distress signals')
ON CONFLICT (agent_type) DO NOTHING;

-- ============================================================
-- MIGRATION: 20260609000003_tender_events_table.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Dedicated structured table for tender/contract events
-- Replaces the fragile regex-over-alerts approach in Tenders.tsx
CREATE TABLE IF NOT EXISTS tender_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  project_name text NOT NULL,
  country text,
  region text,
  sector text,
  event_type text NOT NULL CHECK (event_type IN ('award', 'tender_open', 'cancellation', 're_tender', 'dispute', 'arbitration')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  summary text NOT NULL,
  award_value_usd bigint,
  contractor_name text,
  deadline date,
  agency text,
  source_url text,
  source_alert_id uuid REFERENCES alerts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_events_project ON tender_events(project_id);
CREATE INDEX IF NOT EXISTS idx_tender_events_type ON tender_events(event_type);
CREATE INDEX IF NOT EXISTS idx_tender_events_created ON tender_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tender_events_country ON tender_events(country);
CREATE INDEX IF NOT EXISTS idx_tender_events_severity ON tender_events(severity);

ALTER TABLE tender_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tender_events_read" ON tender_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tender_events_service_write" ON tender_events
  FOR ALL USING (true);

-- Backfill existing alerts into tender_events
-- Parses the "Contract: {type} — {summary}" format
INSERT INTO tender_events (
  project_id, project_name, country, event_type, severity, summary, source_url, source_alert_id, created_at
)
SELECT
  a.project_id,
  COALESCE(a.project_name, 'Unknown'),
  NULL as country,
  lower(
    CASE
      WHEN a.message ILIKE 'Contract: award%' THEN 'award'
      WHEN a.message ILIKE 'Contract: tender_open%' THEN 'tender_open'
      WHEN a.message ILIKE 'Contract: cancellation%' THEN 'cancellation'
      WHEN a.message ILIKE 'Contract: re_tender%' THEN 're_tender'
      WHEN a.message ILIKE 'Contract: dispute%' THEN 'dispute'
      WHEN a.message ILIKE 'Contract: arbitration%' THEN 'arbitration'
      ELSE 'award'
    END
  ),
  a.severity,
  regexp_replace(a.message, '^Contract:\s*(award|tender_open|cancellation|re_tender|dispute|arbitration)\s*—\s*', '', 'i'),
  a.source_url,
  a.id,
  a.created_at
FROM alerts a
WHERE a.message ILIKE 'Contract:%'
  AND NOT EXISTS (
    SELECT 1 FROM tender_events te WHERE te.source_alert_id = a.id
  );

-- ============================================================
-- MIGRATION: 20260609000004_admin_lifetime_grant.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Add audit columns to lifetime_grants so admin-created grants are distinguishable
-- from Paddle-triggered ones.
ALTER TABLE public.lifetime_grants
  ADD COLUMN IF NOT EXISTS grant_source text NOT NULL DEFAULT 'paddle',
  ADD COLUMN IF NOT EXISTS granted_by uuid;

-- admin_grant_lifetime_access
-- Idempotent: re-calling for a user who already has a grant is a no-op (returns
-- existing row). Seat allocation mirrors claim_lifetime_seat: assigns the next
-- seat number if under max_seats, inserts with NULL seat_number if sold out
-- (access is granted regardless).
CREATE OR REPLACE FUNCTION public.admin_grant_lifetime_access(
  p_user_id uuid,
  p_environment text DEFAULT 'live'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_taken integer;
  v_seat integer;
  v_existing public.lifetime_grants%ROWTYPE;
  v_max_seats integer := 100;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  -- Serialize seat allocation for this environment.
  PERFORM pg_advisory_xact_lock(hashtext('lifetime_grants:' || COALESCE(p_environment, 'live')));

  -- Idempotent: user already has a lifetime grant.
  SELECT * INTO v_existing
  FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = COALESCE(p_environment, 'live');

  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', true,
      'reason', 'existing',
      'seat_number', v_existing.seat_number,
      'grant_source', v_existing.grant_source
    );
  END IF;

  SELECT COUNT(*)::integer INTO v_taken
  FROM public.lifetime_grants
  WHERE environment = COALESCE(p_environment, 'live')
    AND seat_number IS NOT NULL;

  IF v_taken < v_max_seats THEN
    v_seat := v_taken + 1;
  ELSE
    v_seat := NULL; -- sold out of named seats; access still granted
  END IF;

  INSERT INTO public.lifetime_grants
    (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number, grant_source, granted_by)
  VALUES
    (p_user_id, COALESCE(p_environment, 'live'), NULL, NULL, v_seat, 'admin', v_admin)
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'granted', true,
    'reason', 'created',
    'seat_number', v_existing.seat_number
  );
END;
$$;

-- admin_revoke_lifetime_access
-- Deletes the grant row entirely. The lifetime_grants table has no status column
-- so there is no "soft revoke" — removing the row is the correct operation.
CREATE OR REPLACE FUNCTION public.admin_revoke_lifetime_access(
  p_user_id uuid,
  p_environment text DEFAULT 'live'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_seat integer;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = COALESCE(p_environment, 'live')
  RETURNING seat_number INTO v_seat;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('revoked', false, 'reason', 'no_grant');
  END IF;

  RETURN jsonb_build_object('revoked', true, 'seat_number', v_seat);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_lifetime_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_lifetime_access(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_grant_lifetime_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lifetime_access(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260609000005_fix_lifetime_seat_functions.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Fix 1: lifetime_seats_taken() was counting ALL rows including NULL-seat post-sellout
-- rows. The marketing page "X of 100 remaining" counter should only count named seats.
CREATE OR REPLACE FUNCTION public.lifetime_seats_taken(p_environment text DEFAULT 'live')
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.lifetime_grants
  WHERE environment = p_environment
    AND seat_number IS NOT NULL;
$$;

-- Fix 2: claim_lifetime_seat was using v_taken + 1 (total row count) as the next seat
-- number. After a grant is revoked (row deleted), v_taken decrements and the recycled
-- index collides with an existing seat holder.
-- Fix: use COALESCE(MAX(seat_number), 0) + 1 to always assign above the current maximum.
CREATE OR REPLACE FUNCTION public.claim_lifetime_seat(
  p_user_id uuid,
  p_environment text,
  p_paddle_transaction_id text,
  p_paddle_customer_id text,
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
      (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
    VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, NULL);
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat
  FROM public.lifetime_grants
  WHERE environment = p_environment;

  INSERT INTO public.lifetime_grants
    (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number)
  VALUES (p_user_id, p_environment, p_paddle_transaction_id, p_paddle_customer_id, v_seat);
  RETURN v_seat;
END;
$$;

-- Fix 3: admin_grant_lifetime_access was using pg_advisory_xact_lock, which does not
-- block claim_lifetime_seat's SELECT ... FOR UPDATE row-level lock. The two functions
-- could run concurrently and both compute the same next seat number.
-- Fix: switch to the same SELECT ... FOR UPDATE pattern as claim_lifetime_seat so the
-- two functions mutually exclude. Also adopt MAX+1 for seat assignment.
CREATE OR REPLACE FUNCTION public.admin_grant_lifetime_access(
  p_user_id uuid,
  p_environment text DEFAULT 'live'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_taken integer;
  v_seat integer;
  v_existing public.lifetime_grants%ROWTYPE;
  v_max_seats integer := 100;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  -- Same FOR UPDATE lock as claim_lifetime_seat — the two functions now block each other.
  SELECT COUNT(*) INTO v_taken FROM public.lifetime_grants
  WHERE environment = COALESCE(p_environment, 'live') FOR UPDATE;

  SELECT * INTO v_existing
  FROM public.lifetime_grants
  WHERE user_id = p_user_id AND environment = COALESCE(p_environment, 'live');

  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', true,
      'reason', 'existing',
      'seat_number', v_existing.seat_number,
      'grant_source', v_existing.grant_source
    );
  END IF;

  IF v_taken < v_max_seats THEN
    SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat
    FROM public.lifetime_grants
    WHERE environment = COALESCE(p_environment, 'live');
  ELSE
    v_seat := NULL;
  END IF;

  INSERT INTO public.lifetime_grants
    (user_id, environment, paddle_transaction_id, paddle_customer_id, seat_number, grant_source, granted_by)
  VALUES
    (p_user_id, COALESCE(p_environment, 'live'), NULL, NULL, v_seat, 'admin', v_admin)
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'granted', true,
    'reason', 'created',
    'seat_number', v_existing.seat_number
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260612090000_alert_origin.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Provenance for alerts: distinguish AI-monitor-generated intelligence from
-- system/human-verified alerts. Monitoring agents (regulatory, market-intel,
-- sentiment, funding, M&A, ESG, supply-chain, stakeholder, tender, security,
-- risk-scorer) now write origin = 'ai_agent'; everything else defaults to
-- 'system'.
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'system';

ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_origin_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_origin_check CHECK (origin IN ('system', 'ai_agent', 'human'));

COMMENT ON COLUMN public.alerts.origin IS
  'Provenance: system (pipeline/rule-based), ai_agent (LLM monitoring agent, unverified), human (staff-entered).';

-- ============================================================
-- MIGRATION: 20260614120000_fix_usage_counters_updated_at.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20260614130000_report_shares.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Shareable public report links.
--
-- Lets a user publish one of their AI report_runs as a read-only public link
-- (top-of-funnel growth: a pilot shares a report, recipients see the product).
--
-- Security model: no broad anonymous RLS on report_runs. Anonymous access goes
-- exclusively through the SECURITY DEFINER function get_shared_report(token),
-- which returns ONLY the display fields of a single, non-revoked, completed
-- report whose token matches. Tokens are random and unguessable. Only the report
-- owner can create or revoke a share.

CREATE TABLE IF NOT EXISTS public.report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_shares_token ON public.report_shares(token);
CREATE INDEX IF NOT EXISTS idx_report_shares_owner ON public.report_shares(created_by, report_run_id);

ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;

-- Owners manage their own shares. No anon policy — anon never touches this table
-- directly (only via the SECURITY DEFINER resolver below).
DROP POLICY IF EXISTS "owners manage own report_shares" ON public.report_shares;
CREATE POLICY "owners manage own report_shares" ON public.report_shares
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Create (or reuse) a share for a report the caller owns. Returns the token.
CREATE OR REPLACE FUNCTION public.create_report_share(p_report_run_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  -- Only the owner of a completed report may share it.
  IF NOT EXISTS (
    SELECT 1 FROM public.report_runs
    WHERE id = p_report_run_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE = 'P0001';
  END IF;

  -- Reuse an existing active share so re-clicking "Share" returns a stable link.
  SELECT token INTO v_token
  FROM public.report_shares
  WHERE report_run_id = p_report_run_id AND created_by = auth.uid() AND NOT revoked
  LIMIT 1;

  IF v_token IS NULL THEN
    INSERT INTO public.report_shares (report_run_id, created_by)
    VALUES (p_report_run_id, auth.uid())
    RETURNING token INTO v_token;
  END IF;

  RETURN v_token;
END;
$$;

-- Owner revokes a share (link stops working).
CREATE OR REPLACE FUNCTION public.revoke_report_share(p_report_run_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.report_shares
  SET revoked = true
  WHERE report_run_id = p_report_run_id AND created_by = auth.uid();
$$;

-- Anonymous resolver: token -> public-safe report fields for one valid share.
-- Returns no rows for unknown/revoked tokens or non-completed reports.
CREATE OR REPLACE FUNCTION public.get_shared_report(p_token text)
RETURNS TABLE(title text, markdown text, report_type text, citations jsonb, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.title, r.markdown, r.report_type, r.citations, r.created_at
  FROM public.report_shares s
  JOIN public.report_runs r ON r.id = s.report_run_id
  WHERE s.token = p_token
    AND s.revoked = false
    AND r.status = 'completed'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.create_report_share(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_report_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_report_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_report_share(uuid) TO authenticated;
-- Public link resolver is callable by anonymous visitors.
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;

-- ============================================================
-- MIGRATION: 20260615000001_increment_demo_quota.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Atomic increment for the public Ask AI demo rate limit.
--
-- Replaces the previous read-then-upsert in the `nl-search-public` Edge Function
-- (which could lose updates under concurrent requests and made the per-IP counter
-- appear "stuck"). A single INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING is
-- atomic, so the returned count is always the true post-increment value.

create or replace function public.increment_demo_quota(p_ip_hash text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.public_demo_rate_limits (ip_hash, query_date, count)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, query_date)
  do update set count = public.public_demo_rate_limits.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

-- Only the service-role Edge Function should call this. Lock out anon/authenticated.
revoke all on function public.increment_demo_quota(text) from public;
revoke all on function public.increment_demo_quota(text) from anon;
revoke all on function public.increment_demo_quota(text) from authenticated;

-- ============================================================
-- MIGRATION: 20260615120000_referral_bonus.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Referral-driven usage-credit reward engine.
--
-- The bonus is DERIVED LIVE from referral_events + auth.users on every call.
-- It is never stored as a spendable balance, which removes drift, double-award
-- and replay-fraud risk (revoking a referral instantly lowers the bonus).
--
-- Economics (confirmed with product):
--   * Referrer earns +3 AI/day per qualified referral, capped at +30/day.
--   * A "qualified" referral = a non-revoked referral_events row whose referred
--     user has a confirmed email. claim_referral_signup() only runs on first
--     login (which already requires email verification), so in practice a row
--     implies a verified user; the email_confirmed_at check is belt-and-braces.
--   * The newly referred user gets a two-sided welcome bonus of +3 AI/day for
--     their first 14 days.
--
-- These functions are consumed by supabase/functions/_shared/entitlementCheck.ts
-- (service-role) which adds the result to the free-tier daily AI cap.

-- Count of qualified referrals made by a user.
CREATE OR REPLACE FUNCTION public.qualified_referral_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.referral_events re
  WHERE re.referrer_id = p_user_id
    AND re.reward_status <> 'revoked'
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = re.referred_id
        AND u.email_confirmed_at IS NOT NULL
    );
$$;

-- Bonus daily AI quota earned from referring others: +3 each, capped at +30.
CREATE OR REPLACE FUNCTION public.referral_ai_bonus(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LEAST(public.qualified_referral_count(p_user_id) * 3, 30);
$$;

-- Two-sided welcome bonus for a newly referred user: +3 AI/day for 14 days.
CREATE OR REPLACE FUNCTION public.referred_welcome_bonus(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.referral_events re
    WHERE re.referred_id = p_user_id
      AND re.reward_status <> 'revoked'
      AND re.created_at > now() - interval '14 days'
  ) THEN 3 ELSE 0 END;
$$;

-- Self-service summary for the referral dashboard. Reads auth.uid() so it is
-- safe to expose to authenticated users (each sees only their own numbers).
CREATE OR REPLACE FUNCTION public.my_referral_summary()
RETURNS TABLE(qualified_count int, pending_count int, ai_bonus int, welcome_bonus int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.qualified_referral_count(auth.uid()),
    GREATEST(
      (SELECT count(*)::int FROM public.referral_events
         WHERE referrer_id = auth.uid() AND reward_status <> 'revoked')
        - public.qualified_referral_count(auth.uid()),
      0
    ),
    public.referral_ai_bonus(auth.uid()),
    public.referred_welcome_bonus(auth.uid());
$$;

-- Cosmetic label flip used for analytics (pending -> awarded). The bonus itself
-- is computed live, so this is best-effort and not the source of truth.
CREATE OR REPLACE FUNCTION public.mark_referral_qualified(p_referred_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.referral_events
  SET reward_status = 'awarded'
  WHERE referred_id = p_referred_user_id
    AND reward_status = 'pending';
END;
$$;

-- Speeds up the EXISTS check that joins referrals to AI usage / lookups.
CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_status
  ON public.referral_events(referrer_id, reward_status);

-- Grants: only the self-scoped summary is callable by end users. The raw
-- count/bonus/mark functions are invoked with the service-role client only.
REVOKE ALL ON FUNCTION public.qualified_referral_count(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.referral_ai_bonus(uuid)        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.referred_welcome_bonus(uuid)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_referral_qualified(uuid)  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_referral_summary() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260615130000_plan_interest.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Pre-payment demand validation ("painted door").
--
-- While billing is not live, every Upgrade/Choose-plan CTA opens an honest
-- founding-access modal instead of a checkout. This table records the resulting
-- intent so we can decide whether to build payments at all, and at what price.
--
-- Privacy: this is first-party, user-initiated data (they fill the form). It is
-- covered by the existing Privacy Notice (account data + product analytics).

CREATE TABLE IF NOT EXISTS public.plan_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  plan_key text NOT NULL,
  billing_cycle text,                          -- 'monthly' | 'yearly' | 'lifetime'
  sentiment text NOT NULL,                     -- 'ready' | 'maybe' | 'curious'
  expected_price integer,                      -- willingness-to-pay (price discovery)
  expected_currency text DEFAULT 'USD',
  note text,
  source text,                                 -- 'pricing' | 'upgrade_dialog' | 'settings'
  current_plan text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,  -- usage snapshot, cycle, etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_interest_sentiment_chk CHECK (sentiment IN ('ready', 'maybe', 'curious'))
);

CREATE INDEX IF NOT EXISTS idx_plan_interest_created_at ON public.plan_interest(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_interest_user_id ON public.plan_interest(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_interest_plan_sentiment ON public.plan_interest(plan_key, sentiment);

ALTER TABLE public.plan_interest ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous pricing-page visitors) may register interest. If they
-- are signed in, the row must be tagged with their own id (no spoofing others).
DROP POLICY IF EXISTS "Anyone can register plan interest" ON public.plan_interest;
CREATE POLICY "Anyone can register plan interest"
ON public.plan_interest
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- Users can see their own submissions.
DROP POLICY IF EXISTS "Users read own plan interest" ON public.plan_interest;
CREATE POLICY "Users read own plan interest"
ON public.plan_interest
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins read everything (founder dashboard / Traction page).
DROP POLICY IF EXISTS "Admins read all plan interest" ON public.plan_interest;
CREATE POLICY "Admins read all plan interest"
ON public.plan_interest
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Service role manages plan interest" ON public.plan_interest;
CREATE POLICY "Service role manages plan interest"
ON public.plan_interest
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Coarse, transparent location for the analytics stream (already disclosed in
-- the Privacy Notice as "device and connection data"). Country only — set
-- server-side from the CDN edge header, never precise GPS.
ALTER TABLE public.user_events
  ADD COLUMN IF NOT EXISTS country text;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260616120000_restore_lifetime_seats_anon_grant.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Restore anon EXECUTE on the public lifetime-seat counter.
--
-- 20260423100347 intentionally granted EXECUTE to anon on lifetime_seats_taken
-- (the marketing "X of 100 seats remaining" counter — returns only an aggregate
-- count, never customer identities). The security-hardening migration
-- 20260428214909 then looped over every SECURITY DEFINER function and ran
-- `REVOKE EXECUTE ... FROM PUBLIC, anon`, which swept up this function too.
--
-- Result: the logged-out Pricing page (src/pages/Pricing.tsx) calls
-- supabase.rpc('lifetime_seats_taken') and gets 401, so the urgency badge never
-- renders for anonymous visitors. Re-grant anon explicitly; this is the only
-- SECURITY DEFINER function that is meant to be public.
GRANT EXECUTE ON FUNCTION public.lifetime_seats_taken(text) TO anon;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- MIGRATION: 20260619000000_health_scoring_cron.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Schedule the health-scoring agent.
--
-- The health-score feature (project_health_score migration, 2026-06-09) shipped
-- after the original agent cron migration (20260421000001), so health-scoring was
-- never put on a schedule — scores only refreshed on a manual staff trigger and
-- went stale. This adds a recurring job using the same pg_cron + net.http_post
-- pattern as 20260421000001.
--
-- Prereq (hosted, once): ALTER DATABASE postgres SET app.service_role_key = '<key>';
-- Idempotent — safe to re-run.

DO $$
DECLARE
  base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1';
  svc_key  TEXT := current_setting('app.service_role_key', true);
  auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    -- Local stacks (supabase db reset) have no app.service_role_key and don't
    -- need hosted cron jobs. Skip instead of failing so local resets work.
    RAISE NOTICE
      'app.service_role_key is not set - skipping health-scoring cron scheduling. On hosted, run: ALTER DATABASE postgres SET app.service_role_key = ''<your key>''; then re-run this script.';
    RETURN;
  END IF;

  auth_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || svc_key
  );

  -- Remove any existing job so this script is idempotent
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('infradar-health-scoring');

  -- Health Scoring: every 6 hours at :40 (offset from existing jobs). The agent
  -- batches the 30 oldest-scored projects per run (order by health_scored_at
  -- nulls first), so this cadence rotates through the portfolio steadily.
  PERFORM cron.schedule('infradar-health-scoring', '40 */6 * * *',
    format($q$SELECT net.http_post(url:='%s/health-score-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'infradar-health-scoring cron job scheduled successfully.';
END;
$$;

-- ============================================================
-- MIGRATION: 20260619120000_outreach.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Semi-autonomous outbound orchestration layer.
--
-- Two tables form the "draft → approve → send → track" spine on top of the
-- existing email infra (send-transactional-email, suppressed_emails, etc.):
--   * outreach_prospects — the people we sequence (named list / contact-finder /
--     gated-newsletter signups). PII lives here, admin-only.
--   * outreach_messages  — one row per (prospect, sequence step); the human
--     approval queue. outreach-draft-agent writes status='draft'; an admin
--     approves; outreach-send-agent only ever touches status='approved'.
--
-- Mirrors bd_partners.sql: admin-only RLS + touch_updated_at trigger + indexes.

-- ---------------------------------------------------------------------------
-- outreach_prospects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_prospects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  org             text,
  role            text,
  email           text,
  linkedin_url    text,
  persona         text NOT NULL DEFAULT 'infra_pe',
    -- 'dfi_analyst' | 'infra_pe' | 'epc_bd' | 'consultant' | 'project_finance'
    -- | 'political_risk' | 'government_ppp' | 'think_tank'
  wave            integer NOT NULL DEFAULT 1,
  region          text,
  sector          text,
  source_url      text,
  status          text NOT NULL DEFAULT 'new',
    -- 'new' | 'sequencing' | 'replied' | 'pilot' | 'paid' | 'unsubscribed' | 'bounced'
  next_step       integer NOT NULL DEFAULT 0,   -- next sequence step to draft (0-4)
  last_contacted_at timestamptz,
  bd_partner_id   uuid REFERENCES public.bd_partners(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One prospect per email address (case-insensitive), but allow many email-less
-- (LinkedIn-only) prospects.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_prospects_email
  ON public.outreach_prospects (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_prospects_status
  ON public.outreach_prospects (status, persona, wave);

ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on outreach_prospects" ON public.outreach_prospects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- outreach_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     uuid NOT NULL REFERENCES public.outreach_prospects(id) ON DELETE CASCADE,
  channel         text NOT NULL DEFAULT 'email',   -- 'email' | 'linkedin'
  step            integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft',
    -- 'draft' | 'approved' | 'scheduled' | 'sent' | 'skipped' | 'failed'
  subject         text,
  body            text NOT NULL,
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  generated_by    text,                            -- model that drafted it
  approved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The send agent scans for due, approved email rows; this index serves it.
CREATE INDEX IF NOT EXISTS idx_outreach_messages_send
  ON public.outreach_messages (status, channel, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_prospect
  ON public.outreach_messages (prospect_id, step);

ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on outreach_messages" ON public.outreach_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- updated_at triggers (one shared function, like touch_bd_partners_updated_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_outreach_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER outreach_prospects_updated_at
  BEFORE UPDATE ON public.outreach_prospects
  FOR EACH ROW EXECUTE FUNCTION public.touch_outreach_updated_at();

CREATE TRIGGER outreach_messages_updated_at
  BEFORE UPDATE ON public.outreach_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_outreach_updated_at();

-- ---------------------------------------------------------------------------
-- Register the three agents so they're pausable from AgentMonitoring.
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_config (agent_type)
VALUES ('outreach_draft'), ('outreach_send'), ('weekly_signal')
ON CONFLICT (agent_type) DO NOTHING;

-- ============================================================
-- MIGRATION: 20260619120100_outreach_cron.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Schedule the semi-autonomous outbound agents.
--
-- Same pg_cron + net.http_post pattern as 20260619000000_health_scoring_cron.sql.
-- Cadence is deliberately gentle to protect sender-domain reputation:
--   * outreach_draft  — once daily; drafts the next touch for due prospects (no send).
--   * outreach_send   — weekday business hours, throttled (the function caps each
--                       run at 50 emails and only sends human-APPROVED messages).
--   * weekly_signal   — weekly inbound newsletter.
--
-- Each agent can still be paused independently from the AgentMonitoring dashboard
-- (agent_config), so disabling a job here is not required to stop one.
--
-- Prereq (hosted, once): ALTER DATABASE postgres SET app.service_role_key = '<key>';
-- Idempotent — safe to re-run.

DO $$
DECLARE
  base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1';
  svc_key  TEXT := current_setting('app.service_role_key', true);
  auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    -- Local stacks (supabase db reset) have no app.service_role_key and don't
    -- need hosted cron jobs. Skip instead of failing so local resets work.
    RAISE NOTICE
      'app.service_role_key is not set - skipping outreach cron scheduling. On hosted, run: ALTER DATABASE postgres SET app.service_role_key = ''<your key>''; then re-run this script.';
    RETURN;
  END IF;

  auth_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || svc_key
  );

  -- Remove any existing jobs so this script is idempotent
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('infradar-outreach-draft', 'infradar-outreach-send', 'infradar-weekly-signal');

  -- Draft next touches: daily at 06:15 UTC (off-peak).
  PERFORM cron.schedule('infradar-outreach-draft', '15 6 * * *',
    format($q$SELECT net.http_post(url:='%s/outreach-draft-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Send approved emails: every 2h from 09:00-15:00 UTC, weekdays only.
  PERFORM cron.schedule('infradar-outreach-send', '0 9-15/2 * * 1-5',
    format($q$SELECT net.http_post(url:='%s/outreach-send-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  -- Weekly Infrastructure Signal: Mondays at 13:00 UTC.
  PERFORM cron.schedule('infradar-weekly-signal', '0 13 * * 1',
    format($q$SELECT net.http_post(url:='%s/weekly-signal-agent', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'outreach cron jobs scheduled successfully.';
END;
$$;

-- ============================================================
-- MIGRATION: 20260625120000_reject_candidate_rpc.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Reject a pipeline candidate.
--
-- The Review Queue (src/pages/dashboard/ReviewQueue.tsx) already calls this RPC,
-- but it was never defined, so the Reject button on pipeline candidates threw at
-- runtime. This mirrors the hardened promote_project_candidate (migration
-- 20260521213952): staff-only, row-locked, and it records a rejection signature
-- in review_actions so the candidate can never re-surface via a future agent run.

DROP FUNCTION IF EXISTS public.reject_project_candidate(uuid, text);
DROP FUNCTION IF EXISTS public.reject_project_candidate(uuid);

CREATE OR REPLACE FUNCTION public.reject_project_candidate(p_candidate_id uuid, p_reason text DEFAULT 'Rejected from verification workbench')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidate public.project_candidates%ROWTYPE;
  v_performed_by uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_performed_by, 'admin'::public.app_role) OR public.has_role(v_performed_by, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: a candidate that is already rejected stays rejected.
  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RETURN jsonb_build_object('candidate_id', p_candidate_id, 'rejected', true, 'already_rejected', true);
  END IF;

  UPDATE public.project_candidates
  SET review_status = 'rejected',
      pipeline_status = 'rejected',
      updated_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO public.review_actions (item_type, candidate_id, action, reason, performed_by)
  VALUES ('candidate', p_candidate_id, 'rejected', COALESCE(p_reason, ''), v_performed_by);

  RETURN jsonb_build_object('candidate_id', p_candidate_id, 'rejected', true, 'already_rejected', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_project_candidate(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_project_candidate(uuid, text) TO authenticated;

-- ============================================================
-- MIGRATION: 20260626120000_milestone_type_column.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================

-- Add milestone_type column to project_milestones.
--
-- TenderCalendar.tsx (lines 43, 59) selects `milestone_type` in its PostgREST
-- queries, but the column was never added to the schema. All requests to
-- /rest/v1/project_milestones?select=...milestone_type... returned HTTP 400
-- ("column project_milestones.milestone_type does not exist").
--
-- Values are freeform strings set by researchers when creating milestones
-- (e.g. "Tender Open", "Financial Close", "Construction Start", etc.).
-- Nullable so existing rows are unaffected.

ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS milestone_type TEXT;

-- Confirm the column exists (idempotent no-op if already added).
COMMENT ON COLUMN public.project_milestones.milestone_type
  IS 'Optional label for the kind of milestone, e.g. "Tender Open", "Financial Close", "Construction Start".';


-- ============================================================
-- MIGRATION: 20260706120000_official_ingest_autopublish.sql
-- Run this block on its own in the Supabase SQL editor.
-- ============================================================
-- Official-registry auto-publish + coordinate quality
--
-- 1. projects/candidates gain `provenance` and `coord_precision`; lat/lng
--    become nullable so unknown locations are stored as NULL (off-map) instead
--    of [0,0] "null island".
-- 2. promote_project_candidate (human review path) now stamps
--    provenance='human_verified' and passes NULL coordinates through.
-- 3. New service-role-only auto_promote_official_candidate() lets deterministic
--    official-API ingest agents (World Bank, IFC, ADB, IADB, AIIB, ...) publish
--    directly with provenance='official_registry'. LLM-extracted candidates
--    (AfDB, EBRD, research-agent) keep the human review gate.
-- 4. ingest_cursors table powers automated offset-based backfill runs.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN lng DROP NOT NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS provenance text
    CHECK (provenance IS NULL OR provenance IN ('official_registry', 'human_verified', 'ai_agent')),
  ADD COLUMN IF NOT EXISTS coord_precision text
    CHECK (coord_precision IS NULL OR coord_precision IN ('exact', 'country'));

ALTER TABLE public.project_candidates
  ADD COLUMN IF NOT EXISTS coord_precision text
    CHECK (coord_precision IS NULL OR coord_precision IN ('exact', 'country'));

-- Null-island cleanup: [0,0] came from unknown-country centroid fallbacks.
UPDATE public.projects SET lat = NULL, lng = NULL, coord_precision = NULL
WHERE lat = 0 AND lng = 0;
UPDATE public.project_candidates SET lat = NULL, lng = NULL, coord_precision = NULL
WHERE lat = 0 AND lng = 0;

-- Legacy provenance backfill: AI-generated rows are identifiable; everything
-- else predates provenance tracking and stays NULL (UI shows no badge).
UPDATE public.projects SET provenance = 'ai_agent'
WHERE provenance IS NULL AND ai_generated = true;

CREATE INDEX IF NOT EXISTS idx_projects_provenance ON public.projects(provenance);

-- Audit action for machine promotion (safe to add; only used at runtime).
ALTER TYPE public.review_action_type ADD VALUE IF NOT EXISTS 'auto_published';

-- ---------------------------------------------------------------------------
-- 2. Human promotion path: stamp provenance, pass NULL coords through
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_project_candidate(p_candidate_id uuid, p_reason text DEFAULT 'Approved from verification workbench')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidate public.project_candidates%ROWTYPE;
  v_project_id uuid;
  v_slug text;
  v_suffix integer := 0;
  v_final_slug text;
  v_claim jsonb;
  v_stakeholder text;
  v_performed_by uuid := auth.uid();
  v_evidence_count integer;
BEGIN
  IF NOT (public.has_role(v_performed_by, 'admin'::public.app_role) OR public.has_role(v_performed_by, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023';
  END IF;

  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RAISE EXCEPTION 'cannot approve a rejected candidate' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_evidence_count
  FROM public.candidate_evidence_links
  WHERE candidate_id = p_candidate_id;

  IF v_evidence_count = 0 THEN
    RAISE EXCEPTION 'cannot approve candidate without evidence trail (no candidate_evidence_links rows)' USING ERRCODE = '22023';
  END IF;

  IF v_candidate.canonical_project_id IS NOT NULL THEN
    UPDATE public.project_candidates
    SET review_status = 'approved', pipeline_status = 'approved', updated_at = now()
    WHERE id = p_candidate_id;
    RETURN jsonb_build_object('project_id', v_candidate.canonical_project_id, 'already_promoted', true);
  END IF;

  v_slug := public.slugify_project_name(v_candidate.name);
  v_final_slug := v_slug;
  WHILE EXISTS (SELECT 1 FROM public.projects WHERE slug = v_final_slug) LOOP
    v_suffix := v_suffix + 1;
    v_final_slug := v_slug || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.projects (
    slug, name, country, region, sector, stage, status, value_usd, value_label,
    confidence, risk_score, lat, lng, coord_precision, description, timeline, source_url,
    ai_generated, approved, provenance, last_updated
  ) VALUES (
    v_final_slug,
    v_candidate.name,
    v_candidate.country,
    COALESCE(v_candidate.region::public.project_region, 'MENA'::public.project_region),
    COALESCE(v_candidate.sector::public.project_sector, 'Infrastructure'::public.project_sector),
    COALESCE(v_candidate.stage::public.project_stage, 'Planned'::public.project_stage),
    COALESCE(v_candidate.status::public.project_status, 'Pending'::public.project_status),
    COALESCE(v_candidate.value_usd, 0)::bigint,
    COALESCE(v_candidate.value_label, '$0'),
    CASE WHEN nullif(trim(coalesce(v_candidate.source_url, '')), '') IS NULL THEN LEAST(v_candidate.confidence, 30) ELSE v_candidate.confidence END,
    v_candidate.risk_score,
    v_candidate.lat,
    v_candidate.lng,
    v_candidate.coord_precision,
    COALESCE(v_candidate.description, ''),
    v_candidate.timeline,
    COALESCE(v_candidate.source_url, ''),
    false,
    true,
    'human_verified',
    now()
  ) RETURNING id INTO v_project_id;

  INSERT INTO public.evidence_sources (project_id, source, url, type, verified, date, title, description, added_by)
  SELECT
    v_project_id,
    COALESCE(sr.name, re.source_key, 'Pipeline Evidence'),
    re.url,
    CASE WHEN re.kind IN ('mdb', 'government', 'procurement', 'regulator') THEN 'Filing'::public.evidence_type ELSE 'News'::public.evidence_type END,
    re.kind IN ('mdb', 'government', 'procurement', 'regulator'),
    COALESCE(to_char(re.published_at::date, 'YYYY-MM-DD'), to_char(re.fetched_at::date, 'YYYY-MM-DD')),
    re.title,
    left(COALESCE(re.summary, ''), 500),
    'pipeline'
  FROM public.candidate_evidence_links cel
  JOIN public.raw_evidence re ON re.id = cel.evidence_id
  LEFT JOIN public.source_registry sr ON sr.id = re.source_id
  WHERE cel.candidate_id = p_candidate_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.project_claims (project_id, evidence_id, field_name, field_value, confidence, quote)
  SELECT v_project_id, evidence_id, field_name, field_value, confidence, quote
  FROM public.project_claims
  WHERE candidate_id = p_candidate_id;

  FOR v_claim IN SELECT jsonb_array_elements(jsonb_build_array(v_candidate.extracted_claims->>'borrower', v_candidate.extracted_claims->>'implementing_agency', v_candidate.extracted_claims->>'stakeholder')) LOOP
    v_stakeholder := trim(both '"' from v_claim::text);
    IF v_stakeholder IS NOT NULL AND v_stakeholder <> '' AND v_stakeholder <> 'null' THEN
      INSERT INTO public.project_stakeholders (project_id, name)
      VALUES (v_project_id, v_stakeholder)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.project_candidates
  SET canonical_project_id = v_project_id,
      review_status = 'approved',
      pipeline_status = 'approved',
      updated_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO public.review_actions (item_type, candidate_id, project_id, action, reason, performed_by)
  VALUES ('candidate', p_candidate_id, v_project_id, 'approved', COALESCE(p_reason, ''), v_performed_by);

  INSERT INTO public.project_verification_log (project_id, action, reason, performed_by)
  VALUES (v_project_id, 'approved', COALESCE(p_reason, 'Approved from verification workbench'), v_performed_by);

  RETURN jsonb_build_object('project_id', v_project_id, 'already_promoted', false, 'evidence_count', v_evidence_count);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_project_candidate(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.promote_project_candidate(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Machine promotion path for deterministic official registries
-- ---------------------------------------------------------------------------
-- Callable only with the service role key (edge functions). No auth.uid()
-- staff check — instead access is locked down via EXECUTE grants.

CREATE OR REPLACE FUNCTION public.auto_promote_official_candidate(p_candidate_id uuid, p_reason text DEFAULT 'Auto-published from official registry ingest')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidate public.project_candidates%ROWTYPE;
  v_project_id uuid;
  v_slug text;
  v_suffix integer := 0;
  v_final_slug text;
  v_claim jsonb;
  v_stakeholder text;
  v_evidence_count integer;
BEGIN
  SELECT * INTO v_candidate FROM public.project_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not found' USING ERRCODE = '22023';
  END IF;

  IF v_candidate.review_status = 'rejected' OR v_candidate.pipeline_status = 'rejected' THEN
    RAISE EXCEPTION 'cannot auto-publish a rejected candidate' USING ERRCODE = '22023';
  END IF;

  -- Machine path still requires an evidence trail and a real source URL.
  SELECT count(*) INTO v_evidence_count
  FROM public.candidate_evidence_links
  WHERE candidate_id = p_candidate_id;
  IF v_evidence_count = 0 THEN
    RAISE EXCEPTION 'cannot auto-publish candidate without evidence trail' USING ERRCODE = '22023';
  END IF;
  IF nullif(trim(coalesce(v_candidate.source_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'cannot auto-publish candidate without a source URL' USING ERRCODE = '22023';
  END IF;

  IF v_candidate.canonical_project_id IS NOT NULL THEN
    UPDATE public.project_candidates
    SET review_status = 'approved', pipeline_status = 'approved', updated_at = now()
    WHERE id = p_candidate_id;
    RETURN jsonb_build_object('project_id', v_candidate.canonical_project_id, 'already_promoted', true);
  END IF;

  v_slug := public.slugify_project_name(v_candidate.name);
  v_final_slug := v_slug;
  WHILE EXISTS (SELECT 1 FROM public.projects WHERE slug = v_final_slug) LOOP
    v_suffix := v_suffix + 1;
    v_final_slug := v_slug || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.projects (
    slug, name, country, region, sector, stage, status, value_usd, value_label,
    confidence, risk_score, lat, lng, coord_precision, description, timeline, source_url,
    ai_generated, approved, provenance, last_updated
  ) VALUES (
    v_final_slug,
    v_candidate.name,
    v_candidate.country,
    COALESCE(v_candidate.region::public.project_region, 'MENA'::public.project_region),
    COALESCE(v_candidate.sector::public.project_sector, 'Infrastructure'::public.project_sector),
    COALESCE(v_candidate.stage::public.project_stage, 'Planned'::public.project_stage),
    COALESCE(v_candidate.status::public.project_status, 'Pending'::public.project_status),
    COALESCE(v_candidate.value_usd, 0)::bigint,
    COALESCE(v_candidate.value_label, '$0'),
    v_candidate.confidence,
    v_candidate.risk_score,
    v_candidate.lat,
    v_candidate.lng,
    v_candidate.coord_precision,
    COALESCE(v_candidate.description, ''),
    v_candidate.timeline,
    v_candidate.source_url,
    false,
    true,
    'official_registry',
    now()
  ) RETURNING id INTO v_project_id;

  INSERT INTO public.evidence_sources (project_id, source, url, type, verified, date, title, description, added_by)
  SELECT
    v_project_id,
    COALESCE(sr.name, re.source_key, 'Pipeline Evidence'),
    re.url,
    CASE WHEN re.kind IN ('mdb', 'government', 'procurement', 'regulator') THEN 'Filing'::public.evidence_type ELSE 'News'::public.evidence_type END,
    re.kind IN ('mdb', 'government', 'procurement', 'regulator'),
    COALESCE(to_char(re.published_at::date, 'YYYY-MM-DD'), to_char(re.fetched_at::date, 'YYYY-MM-DD')),
    re.title,
    left(COALESCE(re.summary, ''), 500),
    'pipeline'
  FROM public.candidate_evidence_links cel
  JOIN public.raw_evidence re ON re.id = cel.evidence_id
  LEFT JOIN public.source_registry sr ON sr.id = re.source_id
  WHERE cel.candidate_id = p_candidate_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.project_claims (project_id, evidence_id, field_name, field_value, confidence, quote)
  SELECT v_project_id, evidence_id, field_name, field_value, confidence, quote
  FROM public.project_claims
  WHERE candidate_id = p_candidate_id;

  FOR v_claim IN SELECT jsonb_array_elements(jsonb_build_array(v_candidate.extracted_claims->>'borrower', v_candidate.extracted_claims->>'implementing_agency', v_candidate.extracted_claims->>'stakeholder')) LOOP
    v_stakeholder := trim(both '"' from v_claim::text);
    IF v_stakeholder IS NOT NULL AND v_stakeholder <> '' AND v_stakeholder <> 'null' THEN
      INSERT INTO public.project_stakeholders (project_id, name)
      VALUES (v_project_id, v_stakeholder)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE public.project_candidates
  SET canonical_project_id = v_project_id,
      review_status = 'approved',
      pipeline_status = 'approved',
      updated_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO public.review_actions (item_type, candidate_id, project_id, action, reason, performed_by)
  VALUES ('candidate', p_candidate_id, v_project_id, 'auto_published', COALESCE(p_reason, ''), NULL);

  INSERT INTO public.project_verification_log (project_id, action, reason, performed_by)
  VALUES (v_project_id, 'auto_published', COALESCE(p_reason, 'Auto-published from official registry ingest'), NULL);

  RETURN jsonb_build_object('project_id', v_project_id, 'already_promoted', false, 'evidence_count', v_evidence_count);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_promote_official_candidate(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_official_candidate(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Backfill cursors
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ingest_cursors (
  agent_key text PRIMARY KEY,
  next_offset integer NOT NULL DEFAULT 0,
  exhausted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingest_cursors ENABLE ROW LEVEL SECURITY;

-- Edge functions use the service role (bypasses RLS); staff can inspect
-- backfill progress from the dashboard.
DROP POLICY IF EXISTS "Staff can read ingest_cursors" ON public.ingest_cursors;
CREATE POLICY "Staff can read ingest_cursors" ON public.ingest_cursors
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));


-- ============================================================
-- MIGRATION: 20260706121000_backfill_cron_schedules.sql
-- Run this block on its own in the Supabase SQL editor.
-- REQUIRES app.service_role_key (see final section below).
-- ============================================================
-- Backfill cron schedules for the deterministic official-registry ingest agents.
--
-- Each job runs with body {"mode":"backfill", ...}: the agent resumes from its
-- persisted ingest_cursors offset and advances it, so hourly runs walk the
-- entire upstream dataset over time. When a source is exhausted the cursor
-- resets to 0 and the same jobs become rolling freshness re-pulls.
--
-- The existing nightly jobs (20260421000001, 20260427210000) stay as-is for
-- top-of-dataset freshness; these hourly jobs provide depth. Jobs are
-- staggered to avoid concurrent edge invocations (each agent also holds a
-- per-agent concurrency lock, so overlap is safe but wasteful).
--
-- BEFORE running this on hosted, ensure app.service_role_key is set:
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE';

DO $$
DECLARE
  base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1';
  svc_key  TEXT := current_setting('app.service_role_key', true);
  auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    RAISE NOTICE
      'app.service_role_key is not set - skipping cron job scheduling. On hosted, run: ALTER DATABASE postgres SET app.service_role_key = ''<your key>''; then re-run this script.';
    RETURN;
  END IF;

  auth_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || svc_key
  );

  -- Remove existing jobs if re-running
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'infradar-world-bank-backfill',
    'infradar-ifc-backfill',
    'infradar-adb-backfill',
    'infradar-iadb-backfill',
    'infradar-aiib-backfill'
  );

  -- World Bank: hourly at :05 — 500 records/run walks the full infra dataset
  -- (~10k projects across statuses) in about a day.
  PERFORM cron.schedule('infradar-world-bank-backfill', '5 * * * *',
    format($q$SELECT net.http_post(url:='%s/world-bank-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","status":"Active,Pipeline,Closed","limit":500}'::jsonb)$q$,
      base_url, auth_hdr));

  -- IFC: hourly at :20
  PERFORM cron.schedule('infradar-ifc-backfill', '20 * * * *',
    format($q$SELECT net.http_post(url:='%s/ifc-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","status":"Active,Pipeline,Closed","limit":500}'::jsonb)$q$,
      base_url, auth_hdr));

  -- ADB: hourly at :35
  PERFORM cron.schedule('infradar-adb-backfill', '35 * * * *',
    format($q$SELECT net.http_post(url:='%s/adb-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","limit":500}'::jsonb)$q$,
      base_url, auth_hdr));

  -- IADB: hourly at :50
  PERFORM cron.schedule('infradar-iadb-backfill', '50 * * * *',
    format($q$SELECT net.http_post(url:='%s/iadb-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","status":"Active,Implementation,Closed","limit":500}'::jsonb)$q$,
      base_url, auth_hdr));

  -- AIIB: hourly at :12 — small dataset (~300 rows), capped at 150/run for
  -- edge CPU headroom; exhausts in a couple of runs then rolls over.
  PERFORM cron.schedule('infradar-aiib-backfill', '12 * * * *',
    format($q$SELECT net.http_post(url:='%s/aiib-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","limit":150}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'Backfill cron jobs scheduled successfully.';
END;
$$;


-- ============================================================
-- MIGRATION: 20260706122000_gem_eib_ted_ingest_agents.sql
-- Run this block on its own in the Supabase SQL editor.
-- REQUIRES app.service_role_key (see final section below).
-- ============================================================
-- Register GEM, EIB and TED ingest agents + cron schedules.
--
-- gem-ingest: Global Energy Monitor Integrated Power Tracker (CC BY 4.0).
--   ~90k power units worldwide with EXACT facility coordinates. Hourly
--   backfill walks the 67 MB CSV via byte-range cursor, then rolls over.
-- eib-ingest: European Investment Bank financed projects (public JSON API,
--   ~17k approved/signed operations). Hourly backfill + nightly freshness.
-- ted-ingest: TED EU procurement notices (CPV 45*, free v3 API) → tender_events.
--
-- BEFORE running this on hosted, ensure app.service_role_key is set:
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY_HERE';

-- 1. Register agent types (pauseable from /dashboard/agents)
ALTER TABLE public.agent_config ADD COLUMN IF NOT EXISTS description text;
INSERT INTO public.agent_config (agent_type, enabled, description) VALUES
  ('gem-ingest', true, 'Global Energy Monitor Integrated Power Tracker — facility-level power projects with exact coordinates (CC BY 4.0)'),
  ('eib-ingest', true, 'European Investment Bank financed projects via the public eib.org JSON API'),
  ('ted-ingest', true, 'TED EU procurement notices (construction CPV 45*) into tender_events')
ON CONFLICT (agent_type) DO NOTHING;

-- 2. Cron schedules
DO $$
DECLARE
  base_url TEXT := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1';
  svc_key  TEXT := current_setting('app.service_role_key', true);
  auth_hdr JSONB;
BEGIN
  IF svc_key IS NULL OR svc_key = '' THEN
    RAISE NOTICE
      'app.service_role_key is not set - skipping cron job scheduling. On hosted, run: ALTER DATABASE postgres SET app.service_role_key = ''<your key>''; then re-run this script.';
    RETURN;
  END IF;

  auth_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || svc_key
  );

  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN ('infradar-gem-backfill', 'infradar-eib-backfill', 'infradar-ted-ingest');

  -- GEM: hourly at :26 — 150 plants/run ≈ full tracker in ~1-2 weeks
  PERFORM cron.schedule('infradar-gem-backfill', '26 * * * *',
    format($q$SELECT net.http_post(url:='%s/gem-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","limit":150}'::jsonb)$q$,
      base_url, auth_hdr));

  -- EIB: hourly at :42 — 300 records/run ≈ full 17k archive in ~2.5 days
  PERFORM cron.schedule('infradar-eib-backfill', '42 * * * *',
    format($q$SELECT net.http_post(url:='%s/eib-ingest-agent', headers:='%s'::jsonb, body:='{"mode":"backfill","limit":300}'::jsonb)$q$,
      base_url, auth_hdr));

  -- TED: daily at 06:30 UTC — last 3 days of notices, deduped by URL
  PERFORM cron.schedule('infradar-ted-ingest', '30 6 * * *',
    format($q$SELECT net.http_post(url:='%s/ted-ingest-agent', headers:='%s'::jsonb, body:='{"days":3,"limit":300}'::jsonb)$q$,
      base_url, auth_hdr));

  RAISE NOTICE 'GEM, EIB and TED cron jobs scheduled successfully.';
END;
$$;


-- ============================================================
-- FINAL: arm cron + verify (run after everything above)
-- ============================================================
-- 1. If app.service_role_key was never set on this database, set it first
--    (Dashboard → Settings → API → service_role key), then RE-RUN the two
--    cron blocks above (they no-op when the key is missing):
--
--    ALTER DATABASE postgres SET app.service_role_key = '<SERVICE_ROLE_KEY>';
--
-- 2. Verify cron jobs are installed:
--    SELECT jobname, schedule FROM cron.job ORDER BY jobname;
--    Expect: infradar-world-bank-backfill, infradar-ifc-backfill,
--            infradar-adb-backfill, infradar-iadb-backfill,
--            infradar-aiib-backfill, infradar-gem-backfill,
--            infradar-eib-backfill, infradar-ted-ingest,
--            plus the pre-existing nightly ingest + agent jobs.
--
-- 3. Watch it work (after the first hourly runs):
--    SELECT agent_type, status, message, created_at FROM agent_run_events
--    ORDER BY created_at DESC LIMIT 30;
--    SELECT count(*), provenance FROM projects GROUP BY provenance;
--    SELECT * FROM ingest_cursors ORDER BY agent_key;
