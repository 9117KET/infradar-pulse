-- Harden projects write access
DROP POLICY IF EXISTS "Auth users insert projects" ON public.projects;
DROP POLICY IF EXISTS "Auth users can update projects" ON public.projects;
DROP POLICY IF EXISTS "Auth users can delete projects" ON public.projects;

CREATE POLICY "Staff can insert projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can update projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can delete projects"
ON public.projects
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

-- Harden evidence source write access
DROP POLICY IF EXISTS "Auth insert evidence" ON public.evidence_sources;
DROP POLICY IF EXISTS "Auth update evidence" ON public.evidence_sources;
DROP POLICY IF EXISTS "Auth delete evidence" ON public.evidence_sources;

CREATE POLICY "Staff can insert evidence"
ON public.evidence_sources
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can update evidence"
ON public.evidence_sources
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can delete evidence"
ON public.evidence_sources
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

-- Harden project contacts write access
DROP POLICY IF EXISTS "Auth insert contacts" ON public.project_contacts;
DROP POLICY IF EXISTS "Auth update contacts" ON public.project_contacts;
DROP POLICY IF EXISTS "Auth delete contacts" ON public.project_contacts;

CREATE POLICY "Staff can insert contacts"
ON public.project_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can update contacts"
ON public.project_contacts
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can delete contacts"
ON public.project_contacts
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

-- Harden project milestones write access
DROP POLICY IF EXISTS "Auth insert milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Auth update milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Auth delete milestones" ON public.project_milestones;

CREATE POLICY "Staff can insert milestones"
ON public.project_milestones
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can update milestones"
ON public.project_milestones
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can delete milestones"
ON public.project_milestones
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

-- Harden project stakeholders write access
DROP POLICY IF EXISTS "Auth insert stakeholders" ON public.project_stakeholders;
DROP POLICY IF EXISTS "Auth update stakeholders" ON public.project_stakeholders;
DROP POLICY IF EXISTS "Auth delete stakeholders" ON public.project_stakeholders;

CREATE POLICY "Staff can insert stakeholders"
ON public.project_stakeholders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can update stakeholders"
ON public.project_stakeholders
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can delete stakeholders"
ON public.project_stakeholders
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

-- Harden insight management access
DROP POLICY IF EXISTS "Auth users manage insights" ON public.insights;
DROP POLICY IF EXISTS "Auth users update insights" ON public.insights;
DROP POLICY IF EXISTS "Auth users delete insights" ON public.insights;

CREATE POLICY "Staff can insert insights"
ON public.insights
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can update insights"
ON public.insights
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

CREATE POLICY "Staff can delete insights"
ON public.insights
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'researcher'::public.app_role)
);

-- Restrict subscriber and waitlist reads
DROP POLICY IF EXISTS "Auth users can read subscribers" ON public.subscribers;
DROP POLICY IF EXISTS "Auth users can read waitlist" ON public.waitlist;

CREATE POLICY "Admins can read subscribers"
ON public.subscribers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can read waitlist"
ON public.waitlist
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));