
-- Expand projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS detailed_analysis text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_risks text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS funding_sources text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS environmental_impact text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS political_context text DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_url text DEFAULT '';

-- Expand evidence_sources table
ALTER TABLE evidence_sources ADD COLUMN IF NOT EXISTS title text DEFAULT '';
ALTER TABLE evidence_sources ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE evidence_sources ADD COLUMN IF NOT EXISTS added_by text DEFAULT 'ai';

-- Allow authenticated users to insert projects
CREATE POLICY "Auth users insert projects" ON projects FOR INSERT TO authenticated WITH CHECK (true);

-- Stakeholders CRUD for authenticated
CREATE POLICY "Auth insert stakeholders" ON project_stakeholders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update stakeholders" ON project_stakeholders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete stakeholders" ON project_stakeholders FOR DELETE TO authenticated USING (true);

-- Milestones CRUD for authenticated
CREATE POLICY "Auth insert milestones" ON project_milestones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update milestones" ON project_milestones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete milestones" ON project_milestones FOR DELETE TO authenticated USING (true);

-- Evidence CRUD for authenticated
CREATE POLICY "Auth insert evidence" ON evidence_sources FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update evidence" ON evidence_sources FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete evidence" ON evidence_sources FOR DELETE TO authenticated USING (true);
