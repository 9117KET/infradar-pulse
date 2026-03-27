
-- Create enums
CREATE TYPE public.project_stage AS ENUM ('Planned', 'Tender', 'Awarded', 'Financing', 'Construction', 'Completed', 'Cancelled', 'Stopped');
CREATE TYPE public.project_status AS ENUM ('Verified', 'Stable', 'Pending', 'At Risk');
CREATE TYPE public.project_region AS ENUM ('MENA', 'East Africa', 'West Africa');
CREATE TYPE public.project_sector AS ENUM ('Urban Development', 'Digital Infrastructure', 'Renewable Energy', 'Transport', 'Water', 'Energy');
CREATE TYPE public.evidence_type AS ENUM ('Satellite', 'Filing', 'News', 'Registry', 'Partner');
CREATE TYPE public.alert_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public.research_task_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region project_region NOT NULL,
  sector project_sector NOT NULL,
  stage project_stage NOT NULL DEFAULT 'Planned',
  status project_status NOT NULL DEFAULT 'Pending',
  value_usd BIGINT NOT NULL DEFAULT 0,
  value_label TEXT NOT NULL DEFAULT '$0',
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  risk_score INTEGER NOT NULL DEFAULT 50 CHECK (risk_score >= 0 AND risk_score <= 100),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  timeline TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT true
);

-- Project stakeholders
CREATE TABLE public.project_stakeholders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

-- Project milestones
CREATE TABLE public.project_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false
);

-- Evidence sources
CREATE TABLE public.evidence_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '#',
  type evidence_type NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  date TEXT NOT NULL
);

-- Project updates (changelog)
CREATE TABLE public.project_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Research tasks queue
CREATE TABLE public.research_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type TEXT NOT NULL,
  query TEXT NOT NULL,
  status research_task_status NOT NULL DEFAULT 'pending',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Alerts table
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'medium',
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Public read access for projects-related tables (intelligence platform is read-public)
CREATE POLICY "Public read access" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.project_stakeholders FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.project_milestones FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.evidence_sources FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.project_updates FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.alerts FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.research_tasks FOR SELECT USING (true);

-- Authenticated users can manage alerts (mark as read)
CREATE POLICY "Auth users update alerts" ON public.alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Service role insert/update for edge functions (via service_role key, bypasses RLS)

-- Enable realtime on projects and alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
