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
