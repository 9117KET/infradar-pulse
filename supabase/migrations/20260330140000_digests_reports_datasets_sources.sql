-- Intelligence platform product layer: digests/newsletters, reports, datasets, raw source ingestion
-- Designed for: per-user personalization + scheduled agents + auditability.

-- 1) Alert rules (saved searches / newsletter subscriptions)
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  cadence text NOT NULL DEFAULT 'daily', -- daily|weekly|realtime (string to avoid enum churn)
  channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[], -- in_app|email
  filters jsonb NOT NULL DEFAULT '{}'::jsonb, -- region/sector/country/stage/value thresholds, etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON public.alert_rules (user_id);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own alert_rules"
  ON public.alert_rules FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users manage own alert_rules"
  ON public.alert_rules FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2) Digests (in-app inbox + optional email mirror)
CREATE TABLE IF NOT EXISTS public.digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.alert_rules (id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  markdown text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, -- structured sections, links, counts
  status text NOT NULL DEFAULT 'ready', -- ready|sent|failed
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digests_user_created ON public.digests (user_id, created_at DESC);

ALTER TABLE public.digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own digests"
  ON public.digests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own digests (read flag)"
  ON public.digests FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Inserts/updates are expected to be done by service role (scheduled agents) or staff tooling.

-- 3) Report runs (scheduled / on-demand briefs)
CREATE TABLE IF NOT EXISTS public.report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  report_type text NOT NULL, -- executive_brief|weekly_digest|market_snapshot...
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running', -- running|completed|failed
  title text,
  markdown text NOT NULL DEFAULT '',
  citations jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{label,url}]
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_report_runs_created ON public.report_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_runs_user_created ON public.report_runs (user_id, created_at DESC);

ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

-- Staff can read all; users can read their own.
CREATE POLICY "Users read own report_runs"
  ON public.report_runs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all report_runs"
  ON public.report_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Raw sources (audit trail of ingested external content)
CREATE TABLE IF NOT EXISTS public.raw_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL DEFAULT '', -- e.g. infradar:oct-2025-report, firecrawl:urlhash
  url text NOT NULL,
  title text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'url', -- url|pdf|html|markdown|api
  fetched_at timestamptz NOT NULL DEFAULT now(),
  content_text text NOT NULL DEFAULT '',
  content_hash text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_raw_sources_url ON public.raw_sources (url);

ALTER TABLE public.raw_sources ENABLE ROW LEVEL SECURITY;

-- Raw sources often contain licensed text; restrict to staff.
CREATE POLICY "Staff read raw_sources"
  ON public.raw_sources FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'researcher'));

-- Writes are done by service role; no user insert policy.

-- 5) Dataset snapshots (premium datasets backing)
CREATE TABLE IF NOT EXISTS public.dataset_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_key text NOT NULL, -- projects_v1, tenders_v1, etc.
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL DEFAULT 'agent',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_dataset_snapshots_key_time ON public.dataset_snapshots (dataset_key, generated_at DESC);

ALTER TABLE public.dataset_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read dataset_snapshots"
  ON public.dataset_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- Inserts are service role only.

-- Realtime for digests/report runs (optional UX)
ALTER PUBLICATION supabase_realtime ADD TABLE public.digests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_runs;

