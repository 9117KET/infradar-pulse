-- Add visibility to report_runs so public snapshots can be served without auth.
ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
    -- 'private' | 'public'

-- Allow anonymous reads for public reports
CREATE POLICY "Anon reads public report_runs"
  ON public.report_runs FOR SELECT
  TO anon
  USING (visibility = 'public');
