DELETE FROM public.project_contacts pc
USING public.project_contacts keep
WHERE pc.project_id = keep.project_id
  AND pc.name IS NOT DISTINCT FROM keep.name
  AND pc.organization IS NOT DISTINCT FROM keep.organization
  AND pc.ctid > keep.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS project_contacts_unique_person
  ON public.project_contacts (project_id, name, organization) NULLS NOT DISTINCT;