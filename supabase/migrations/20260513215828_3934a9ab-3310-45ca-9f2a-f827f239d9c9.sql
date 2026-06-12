CREATE TABLE IF NOT EXISTS public.review_actions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type           text NOT NULL CHECK (item_type IN ('candidate','update','project','duplicate','source')),
  candidate_id        uuid REFERENCES public.project_candidates(id) ON DELETE SET NULL,
  update_proposal_id  uuid REFERENCES public.update_proposals(id) ON DELETE SET NULL,
  project_id          uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  action              text NOT NULL,
  reason              text NOT NULL DEFAULT '',
  performed_by        uuid DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read review_actions" ON public.review_actions;
CREATE POLICY "Staff can read review_actions"
  ON public.review_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'researcher'));

DROP POLICY IF EXISTS "Staff can insert review_actions" ON public.review_actions;
CREATE POLICY "Staff can insert review_actions"
  ON public.review_actions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'researcher'));

DROP POLICY IF EXISTS "Service role manages review_actions" ON public.review_actions;
CREATE POLICY "Service role manages review_actions"
  ON public.review_actions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS review_actions_candidate_idx ON public.review_actions(candidate_id);
CREATE INDEX IF NOT EXISTS review_actions_update_idx ON public.review_actions(update_proposal_id);

CREATE OR REPLACE FUNCTION public._coerce_region(p text)
RETURNS public.project_region LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p::public.project_region;
EXCEPTION WHEN OTHERS THEN RETURN 'South Asia'::public.project_region;
END $$;

CREATE OR REPLACE FUNCTION public._coerce_sector(p text)
RETURNS public.project_sector LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p::public.project_sector;
EXCEPTION WHEN OTHERS THEN RETURN 'Transport'::public.project_sector;
END $$;

CREATE OR REPLACE FUNCTION public._coerce_stage(p text)
RETURNS public.project_stage LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN COALESCE(p,'Planned')::public.project_stage;
EXCEPTION WHEN OTHERS THEN RETURN 'Planned'::public.project_stage;
END $$;

CREATE OR REPLACE FUNCTION public._coerce_status(p text)
RETURNS public.project_status LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN COALESCE(p,'Pending')::public.project_status;
EXCEPTION WHEN OTHERS THEN RETURN 'Pending'::public.project_status;
END $$;

-- Replay safety: 20260429213000 defines this with a different return type, so
-- CREATE OR REPLACE alone fails on fresh replays.
DROP FUNCTION IF EXISTS public.promote_project_candidate(uuid, text);
CREATE OR REPLACE FUNCTION public.promote_project_candidate(
  p_candidate_id uuid,
  p_reason       text DEFAULT 'Promoted from review queue'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c           public.project_candidates%ROWTYPE;
  v_uid       uuid := auth.uid();
  v_project_id uuid;
  v_slug      text;
  v_base_slug text;
  v_n         int := 0;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'researcher')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO c FROM public.project_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate % not found', p_candidate_id; END IF;

  IF c.canonical_project_id IS NOT NULL THEN
    UPDATE public.projects SET approved = true, last_updated = now()
      WHERE id = c.canonical_project_id;
    UPDATE public.project_candidates
       SET review_status='approved', pipeline_status='approved', updated_at = now()
     WHERE id = p_candidate_id;
    INSERT INTO public.review_actions(item_type, candidate_id, project_id, action, reason, performed_by)
      VALUES ('candidate', p_candidate_id, c.canonical_project_id, 'approved', p_reason, v_uid);
    RETURN c.canonical_project_id;
  END IF;

  v_base_slug := regexp_replace(lower(coalesce(c.name,'project')), '[^a-z0-9]+', '-', 'g');
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN v_base_slug := 'project'; END IF;
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.projects WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base_slug || '-' || v_n::text;
  END LOOP;

  INSERT INTO public.projects (
    slug, name, country, region, sector, stage, status,
    value_usd, value_label, confidence, risk_score,
    lat, lng, description, timeline, source_url,
    ai_generated, approved
  ) VALUES (
    v_slug,
    coalesce(c.name,'Untitled project'),
    coalesce(c.country,'Unknown'),
    public._coerce_region(c.region),
    public._coerce_sector(c.sector),
    public._coerce_stage(c.stage),
    public._coerce_status(c.status),
    coalesce(c.value_usd,0)::bigint,
    coalesce(c.value_label,'Value TBD'),
    LEAST(GREATEST(coalesce(c.confidence,50),0),100),
    LEAST(GREATEST(coalesce(c.risk_score,40),0),100),
    coalesce(c.lat, 0),
    coalesce(c.lng, 0),
    coalesce(c.description,''),
    c.timeline,
    coalesce(c.source_url,''),
    true,
    true
  ) RETURNING id INTO v_project_id;

  UPDATE public.project_candidates
     SET review_status='approved', pipeline_status='approved',
         canonical_project_id = v_project_id, updated_at = now()
   WHERE id = p_candidate_id;

  INSERT INTO public.review_actions(item_type, candidate_id, project_id, action, reason, performed_by)
    VALUES ('candidate', p_candidate_id, v_project_id, 'approved', p_reason, v_uid);

  RETURN v_project_id;
END $$;

GRANT EXECUTE ON FUNCTION public.promote_project_candidate(uuid, text) TO authenticated;

-- Replay safety: 20260429213000 defines this with a different return type.
DROP FUNCTION IF EXISTS public.apply_update_proposal(uuid, text);
CREATE OR REPLACE FUNCTION public.apply_update_proposal(
  p_update_proposal_id uuid,
  p_reason             text DEFAULT 'Update applied from review queue'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  up      public.update_proposals%ROWTYPE;
  v_uid   uuid := auth.uid();
  v_key   text;
  v_val   text;
BEGIN
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'researcher')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO up FROM public.update_proposals WHERE id = p_update_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Update proposal % not found', p_update_proposal_id; END IF;
  IF up.project_id IS NULL THEN RAISE EXCEPTION 'Update proposal has no project'; END IF;

  FOR v_key, v_val IN
    SELECT key, value
      FROM jsonb_each_text(coalesce(up.field_changes, '{}'::jsonb))
  LOOP
    IF v_key = 'stage' THEN
      UPDATE public.projects SET stage = public._coerce_stage(v_val), last_updated = now() WHERE id = up.project_id;
    ELSIF v_key = 'status' THEN
      UPDATE public.projects SET status = public._coerce_status(v_val), last_updated = now() WHERE id = up.project_id;
    ELSIF v_key = 'sector' THEN
      UPDATE public.projects SET sector = public._coerce_sector(v_val), last_updated = now() WHERE id = up.project_id;
    ELSIF v_key = 'region' THEN
      UPDATE public.projects SET region = public._coerce_region(v_val), last_updated = now() WHERE id = up.project_id;
    ELSIF v_key = 'value_usd' THEN
      UPDATE public.projects SET value_usd = coalesce(NULLIF(v_val,'')::bigint,0), last_updated = now() WHERE id = up.project_id;
    ELSIF v_key = 'risk_score' THEN
      UPDATE public.projects SET risk_score = LEAST(GREATEST(coalesce(NULLIF(v_val,'')::int,50),0),100), last_updated = now() WHERE id = up.project_id;
    ELSIF v_key = 'confidence' THEN
      UPDATE public.projects SET confidence = LEAST(GREATEST(coalesce(NULLIF(v_val,'')::int,50),0),100), last_updated = now() WHERE id = up.project_id;
    ELSIF v_key IN ('value_label','timeline','description','source_url',
                    'detailed_analysis','key_risks','funding_sources',
                    'environmental_impact','political_context','country','name') THEN
      EXECUTE format('UPDATE public.projects SET %I = $1, last_updated = now() WHERE id = $2', v_key)
        USING v_val, up.project_id;

      INSERT INTO public.project_updates(project_id, field_changed, new_value, source)
        VALUES (up.project_id, v_key, v_val, coalesce(up.proposed_by_agent,'agent'));
    END IF;
  END LOOP;

  UPDATE public.update_proposals
     SET status = 'approved', reviewed_by = v_uid, reviewed_at = now()
   WHERE id = p_update_proposal_id;

  INSERT INTO public.review_actions(item_type, update_proposal_id, project_id, action, reason, performed_by)
    VALUES ('update', p_update_proposal_id, up.project_id, 'approved', p_reason, v_uid);

  RETURN up.project_id;
END $$;

GRANT EXECUTE ON FUNCTION public.apply_update_proposal(uuid, text) TO authenticated;