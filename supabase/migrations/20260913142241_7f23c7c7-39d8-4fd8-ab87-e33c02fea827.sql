-- Map the wording real feeds use onto our own stage/status vocabulary, so a
-- genuine improvement written as "Under Construction" or "On Track" is
-- recognised instead of escalated. Wording that signals trouble, or that we do
-- not recognise, deliberately returns NULL so the proposal goes to a human.

CREATE OR REPLACE FUNCTION public.map_proposed_stage(p_value text)
RETURNS public.project_stage
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE v text := lower(trim(COALESCE(p_value, '')));
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  IF v ~ '(cancel|terminat|stopp|suspend|halt|on hold|abandon|shelv)' THEN RETURN NULL; END IF;
  IF v ~ '(complet|operational|in operation|^operation|commission(ed)?$|finished|closed)' THEN RETURN 'Completed'::public.project_stage; END IF;
  IF v ~ '(construction|implementation|execution|building|works underway|commissioning)' THEN RETURN 'Construction'::public.project_stage; END IF;
  IF v ~ '(financ|funding|financial close|negotiat)' THEN RETURN 'Financing'::public.project_stage; END IF;
  IF v ~ '(award|contract signed|contract sign)' THEN RETURN 'Awarded'::public.project_stage; END IF;
  IF v ~ '(tender|bid|procure|rfp|rfq|solicit)' THEN RETURN 'Tender'::public.project_stage; END IF;
  IF v ~ '(plan|propos|identif|apprais|prepar|pre.?construction|feasib|design|concept|pipeline|study)' THEN RETURN 'Planned'::public.project_stage; END IF;
  BEGIN
    RETURN p_value::public.project_stage;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.map_proposed_status(p_value text)
RETURNS public.project_status
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE v text := lower(trim(COALESCE(p_value, '')));
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  IF v ~ '(risk|delay|stall|cancel|suspend|troubl|dispute|halt|behind)' THEN RETURN NULL; END IF;
  IF v ~ '(verified|confirmed)' THEN RETURN 'Verified'::public.project_status; END IF;
  IF v ~ '(stable|active|ongoing|on track|underway|in progress|proceed|normal|operational|healthy)' THEN RETURN 'Stable'::public.project_status; END IF;
  IF v ~ '(pending|under review|unconfirmed|under development|planned|reported)' THEN RETURN 'Pending'::public.project_status; END IF;
  BEGIN
    RETURN p_value::public.project_status;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_proposal_auto_decision(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_p public.update_proposals%ROWTYPE;
  v_proj public.projects%ROWTYPE;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_txt text;
  v_num integer;
  v_stage public.project_stage;
  v_status public.project_status;
BEGIN
  SELECT * INTO v_p FROM public.update_proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible', false, 'reason', 'proposal_not_found'); END IF;
  IF v_p.status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'proposal_not_pending');
  END IF;

  SELECT * INTO v_proj FROM public.projects WHERE id = v_p.project_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible', false, 'reason', 'project_not_found'); END IF;

  IF v_p.confidence < 60 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'low_confidence');
  END IF;

  IF COALESCE(v_p.source_url, '') NOT LIKE 'http%' AND COALESCE(v_proj.source_url, '') NOT LIKE 'http%' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_source_url');
  END IF;

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_p.field_changes) LOOP
    v_txt := trim(both '"' FROM v_val::text);
    IF v_txt IS NULL OR v_txt IN ('', 'null') THEN CONTINUE; END IF;

    IF v_key = 'last_updated' THEN
      -- Bookkeeping only; the apply step always refreshes it.
      CONTINUE;

    ELSIF v_key = 'confidence' THEN
      BEGIN v_num := v_txt::numeric::integer; EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'unparseable_confidence');
      END;
      IF v_num < 0 OR v_num > 100 THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'confidence_out_of_range');
      END IF;
      IF v_num < COALESCE(v_proj.confidence, 0) THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'confidence_downgrade');
      END IF;
      IF v_num > COALESCE(v_proj.confidence, 0) THEN
        v_changes := v_changes || jsonb_build_object('confidence', v_num);
      END IF;

    ELSIF v_key = 'source_url' THEN
      IF v_txt NOT LIKE 'http%' THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'invalid_source_url');
      END IF;
      IF COALESCE(v_proj.source_url, '') NOT LIKE 'http%' THEN
        v_changes := v_changes || jsonb_build_object('source_url', v_txt);
      ELSIF v_txt <> v_proj.source_url THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'source_url_conflict');
      END IF;

    ELSIF v_key = 'stage' THEN
      v_stage := public.map_proposed_stage(v_txt);
      IF v_stage IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'unknown_stage');
      END IF;
      IF public._stage_rank(v_stage) = 0 THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'adverse_stage');
      END IF;
      IF public._stage_rank(v_stage) < public._stage_rank(v_proj.stage) THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'stage_regression');
      END IF;
      IF public._stage_rank(v_stage) > public._stage_rank(v_proj.stage) THEN
        v_changes := v_changes || jsonb_build_object('stage', v_stage::text);
      END IF;

    ELSIF v_key = 'status' THEN
      v_status := public.map_proposed_status(v_txt);
      IF v_status IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'unknown_status');
      END IF;
      IF public._status_rank(v_status) = 0 THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'adverse_status');
      END IF;
      IF public._status_rank(v_status) < public._status_rank(v_proj.status) THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'status_downgrade');
      END IF;
      IF public._status_rank(v_status) > public._status_rank(v_proj.status) THEN
        v_changes := v_changes || jsonb_build_object('status', v_status::text);
      END IF;

    ELSE
      RETURN jsonb_build_object('eligible', false, 'reason', 'unsupported_field:' || v_key);
    END IF;
  END LOOP;

  IF v_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_net_improvement');
  END IF;

  RETURN jsonb_build_object('eligible', true, 'changes', v_changes);
END;
$$;

REVOKE ALL ON FUNCTION public.update_proposal_auto_decision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_proposed_stage(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.map_proposed_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_proposal_auto_decision(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.map_proposed_stage(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.map_proposed_status(text) TO authenticated, service_role;