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
CREATE POLICY "health_history_read" ON project_health_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = project_id AND p.approved = true
    )
  );

-- Service role (agents) can insert
CREATE POLICY "health_history_insert_service" ON project_health_history
  FOR INSERT WITH CHECK (true);

-- Add agent_config entry for health-scoring agent
INSERT INTO agent_config (agent_type, enabled, description)
VALUES ('health-scoring', true, 'Computes per-project health score and delay probability from multi-signal analysis')
ON CONFLICT (agent_type) DO NOTHING;
