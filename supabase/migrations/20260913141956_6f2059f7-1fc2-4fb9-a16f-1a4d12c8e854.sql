-- 1. Missing helper used by the duplicate merge functions
CREATE OR REPLACE FUNCTION public.normalize_project_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- 2. Human escalation queue for every automated process
CREATE TABLE IF NOT EXISTS public.agent_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process text NOT NULL,
  reason_code text NOT NULL,
  detail text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  subject_type text,
  subject_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurrences integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.agent_escalations TO authenticated;
GRANT ALL ON public.agent_escalations TO service_role;

ALTER TABLE public.agent_escalations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read escalations" ON public.agent_escalations;
CREATE POLICY "Staff read escalations" ON public.agent_escalations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Staff update escalations" ON public.agent_escalations;
CREATE POLICY "Staff update escalations" ON public.agent_escalations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Service role manages escalations" ON public.agent_escalations;
CREATE POLICY "Service role manages escalations" ON public.agent_escalations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_escalations_open_dedupe
  ON public.agent_escalations (process, reason_code, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('open','acknowledged');
CREATE INDEX IF NOT EXISTS idx_agent_escalations_status ON public.agent_escalations (status, severity, last_seen_at DESC);

DROP TRIGGER IF EXISTS trg_agent_escalations_updated_at ON public.agent_escalations;
CREATE TRIGGER trg_agent_escalations_updated_at
  BEFORE UPDATE ON public.agent_escalations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Raise (or refresh) an escalation. Safe for any automated caller.
CREATE OR REPLACE FUNCTION public.escalate_to_human(
  p_process text,
  p_reason_code text,
  p_detail text DEFAULT '',
  p_severity text DEFAULT 'medium',
  p_subject_type text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_sev text := CASE WHEN p_severity IN ('low','medium','high','critical') THEN p_severity ELSE 'medium' END;
BEGIN
  SELECT id INTO v_id FROM public.agent_escalations
  WHERE process = p_process AND reason_code = p_reason_code
    AND COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('open','acknowledged')
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.agent_escalations
    SET occurrences = occurrences + 1,
        last_seen_at = now(),
        detail = COALESCE(NULLIF(p_detail, ''), detail),
        severity = v_sev,
        metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.agent_escalations (
    process, reason_code, detail, severity, subject_type, subject_id, project_id, metadata
  ) VALUES (
    p_process, p_reason_code, COALESCE(p_detail, ''), v_sev, p_subject_type, p_subject_id, p_project_id,
    COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_escalation(p_id uuid, p_status text, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_actor, 'admin'::public.app_role) OR public.has_role(v_actor, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open','acknowledged','resolved','dismissed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.agent_escalations
  SET status = p_status,
      resolution_note = COALESCE(NULLIF(p_note, ''), resolution_note),
      resolved_by = CASE WHEN p_status IN ('resolved','dismissed') THEN v_actor ELSE resolved_by END,
      resolved_at = CASE WHEN p_status IN ('resolved','dismissed') THEN now() ELSE NULL END
  WHERE id = p_id;

  RETURN jsonb_build_object('updated', true, 'id', p_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_to_human(text, text, text, text, text, uuid, uuid, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_escalation(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.escalate_to_human(text, text, text, text, text, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_escalation(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.normalize_project_key(text) FROM anon;