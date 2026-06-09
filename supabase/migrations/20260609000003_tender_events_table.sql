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
