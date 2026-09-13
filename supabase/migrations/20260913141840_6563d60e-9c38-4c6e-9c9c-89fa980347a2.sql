-- Auto-approval of genuinely improving update proposals + safe duplicate project merging

CREATE OR REPLACE FUNCTION public._stage_rank(p_stage public.project_stage)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_stage
    WHEN 'Planned' THEN 1
    WHEN 'Tender' THEN 2
    WHEN 'Awarded' THEN 3
    WHEN 'Financing' THEN 4
    WHEN 'Construction' THEN 5
    WHEN 'Completed' THEN 6
    ELSE 0 -- Cancelled / Stopped: never an automatic improvement
  END;
$$;

CREATE OR REPLACE FUNCTION public._status_rank(p_status public.project_status)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_status
    WHEN 'Pending' THEN 1
    WHEN 'Stable' THEN 2
    WHEN 'Verified' THEN 3
    ELSE 0 -- At Risk / Cancelled: never an automatic improvement
  END;
$$;

-- Decide whether a proposal is a genuine, safe improvement and return the
-- filtered change set. Any adverse proposed change (stage regression, status
-- downgrade, cancellation, lower confidence, source overwrite) makes the whole
-- proposal ineligible so it stays in human review.
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

  -- Provenance requirement: either the proposal cites a real URL or the project
  -- already carries one.
  IF COALESCE(v_p.source_url, '') NOT LIKE 'http%' AND COALESCE(v_proj.source_url, '') NOT LIKE 'http%' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_source_url');
  END IF;

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_p.field_changes) LOOP
    v_txt := trim(both '"' FROM v_val::text);
    IF v_txt IS NULL OR v_txt IN ('', 'null') THEN CONTINUE; END IF;

    IF v_key = 'confidence' THEN
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
        -- never silently replace an existing verified source
        RETURN jsonb_build_object('eligible', false, 'reason', 'source_url_conflict');
      END IF;

    ELSIF v_key = 'stage' THEN
      BEGIN
        IF public._stage_rank(v_txt::public.project_stage) = 0 THEN
          RETURN jsonb_build_object('eligible', false, 'reason', 'adverse_stage');
        END IF;
        IF public._stage_rank(v_txt::public.project_stage) < public._stage_rank(v_proj.stage) THEN
          RETURN jsonb_build_object('eligible', false, 'reason', 'stage_regression');
        END IF;
        IF public._stage_rank(v_txt::public.project_stage) > public._stage_rank(v_proj.stage) THEN
          v_changes := v_changes || jsonb_build_object('stage', v_txt);
        END IF;
      EXCEPTION WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'unknown_stage');
      END;

    ELSIF v_key = 'status' THEN
      BEGIN
        IF public._status_rank(v_txt::public.project_status) = 0 THEN
          RETURN jsonb_build_object('eligible', false, 'reason', 'adverse_status');
        END IF;
        IF public._status_rank(v_txt::public.project_status) < public._status_rank(v_proj.status) THEN
          RETURN jsonb_build_object('eligible', false, 'reason', 'status_downgrade');
        END IF;
        IF public._status_rank(v_txt::public.project_status) > public._status_rank(v_proj.status) THEN
          v_changes := v_changes || jsonb_build_object('status', v_txt);
        END IF;
      EXCEPTION WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'unknown_status');
      END;

    ELSE
      -- an unrecognised field is exactly the case a human should look at
      RETURN jsonb_build_object('eligible', false, 'reason', 'unsupported_field:' || v_key);
    END IF;
  END LOOP;

  IF v_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_net_improvement');
  END IF;

  RETURN jsonb_build_object('eligible', true, 'changes', v_changes);
END;
$$;

-- Apply an auto-eligible proposal. Callable by staff or by trusted server-side
-- callers (service role, cron) where auth.uid() is null.
CREATE OR REPLACE FUNCTION public.auto_apply_update_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_decision jsonb;
  v_changes jsonb;
  v_p public.update_proposals%ROWTYPE;
  v_proj public.projects%ROWTYPE;
  v_key text;
  v_val jsonb;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL
     AND NOT (public.has_role(v_actor, 'admin'::public.app_role) OR public.has_role(v_actor, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM public.update_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied', false, 'reason', 'proposal_not_found'); END IF;

  v_decision := public.update_proposal_auto_decision(p_proposal_id);
  IF NOT (v_decision->>'eligible')::boolean THEN
    RETURN jsonb_build_object('applied', false, 'reason', v_decision->>'reason');
  END IF;
  v_changes := v_decision->'changes';

  SELECT * INTO v_proj FROM public.projects WHERE id = v_p.project_id FOR UPDATE;

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_changes) LOOP
    INSERT INTO public.project_updates (project_id, field_changed, old_value, new_value, source)
    VALUES (
      v_proj.id, v_key,
      COALESCE(to_jsonb(v_proj)->>v_key, ''),
      trim(both '"' FROM v_val::text),
      'Auto-approved update (' || v_p.proposed_by_agent || ')'
    );
  END LOOP;

  UPDATE public.projects
  SET stage = COALESCE((v_changes->>'stage')::public.project_stage, stage),
      status = COALESCE((v_changes->>'status')::public.project_status, status),
      confidence = COALESCE((v_changes->>'confidence')::integer, confidence),
      source_url = COALESCE(v_changes->>'source_url', source_url),
      last_updated = now()
  WHERE id = v_proj.id;

  UPDATE public.update_proposals
  SET status = 'applied', reviewed_by = v_actor, reviewed_at = now()
  WHERE id = p_proposal_id;

  INSERT INTO public.review_actions (item_type, project_id, update_proposal_id, action, reason, performed_by)
  VALUES ('update', v_proj.id, p_proposal_id, 'auto_approved',
          'Auto-approved: ' || (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_changes) k) || ' improved with cited source',
          v_actor);

  INSERT INTO public.project_verification_log (project_id, action, reason, performed_by)
  VALUES (v_proj.id, 'auto_updated', 'Automatic improvement from ' || v_p.proposed_by_agent, v_actor);

  RETURN jsonb_build_object('applied', true, 'project_id', v_proj.id, 'changes', v_changes);
END;
$$;

-- Batch pass over the pending/approved backlog.
CREATE OR REPLACE FUNCTION public.auto_apply_pending_update_proposals(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_res jsonb;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_reasons jsonb := '{}'::jsonb;
  v_reason text;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL
     AND NOT (public.has_role(v_actor, 'admin'::public.app_role) OR public.has_role(v_actor, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  FOR v_id IN
    SELECT id FROM public.update_proposals
    WHERE status IN ('pending', 'approved')
    ORDER BY created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000))
  LOOP
    BEGIN
      v_res := public.auto_apply_update_proposal(v_id);
      IF (v_res->>'applied')::boolean THEN
        v_applied := v_applied + 1;
      ELSE
        v_skipped := v_skipped + 1;
        v_reason := COALESCE(v_res->>'reason', 'unknown');
        v_reasons := jsonb_set(v_reasons, ARRAY[v_reason],
          to_jsonb(COALESCE((v_reasons->>v_reason)::integer, 0) + 1), true);
      END IF;
    EXCEPTION WHEN others THEN
      v_skipped := v_skipped + 1;
      v_reasons := jsonb_set(v_reasons, ARRAY['error'],
        to_jsonb(COALESCE((v_reasons->>'error')::integer, 0) + 1), true);
    END;
  END LOOP;

  RETURN jsonb_build_object('applied', v_applied, 'left_for_review', v_skipped, 'reasons', v_reasons);
END;
$$;

-- ============ Duplicate project merging ============

-- Merge p_duplicate_id into p_keep_id: move every child record, keep the
-- strongest field values, then delete the duplicate row.
CREATE OR REPLACE FUNCTION public.merge_project_pair(p_keep_id uuid, p_duplicate_id uuid, p_reason text DEFAULT 'Automatic duplicate merge')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_keep public.projects%ROWTYPE;
  v_dup public.projects%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL
     AND NOT (public.has_role(v_actor, 'admin'::public.app_role) OR public.has_role(v_actor, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_keep_id = p_duplicate_id THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'same_project');
  END IF;

  SELECT * INTO v_keep FROM public.projects WHERE id = p_keep_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('merged', false, 'reason', 'keep_not_found'); END IF;
  SELECT * INTO v_dup FROM public.projects WHERE id = p_duplicate_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('merged', false, 'reason', 'duplicate_not_found'); END IF;

  -- Safety: only merge records that really describe the same thing.
  IF public.normalize_project_key(v_keep.name) IS DISTINCT FROM public.normalize_project_key(v_dup.name)
     OR lower(trim(COALESCE(v_keep.country, ''))) IS DISTINCT FROM lower(trim(COALESCE(v_dup.country, ''))) THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'not_a_duplicate');
  END IF;

  -- Re-point children (ignore rows that would violate a uniqueness rule).
  UPDATE public.evidence_sources SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.project_updates SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.alerts SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.project_milestones SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.project_verification_log SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.project_claims SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.project_recheck_findings SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.project_health_history SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.quality_scores SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.update_proposals SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.review_actions SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.project_candidates SET canonical_project_id = p_keep_id WHERE canonical_project_id = p_duplicate_id;
  UPDATE public.contacts SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.contractor_awards SET project_id = p_keep_id WHERE project_id = p_duplicate_id;
  UPDATE public.tender_events SET project_id = p_keep_id WHERE project_id = p_duplicate_id;

  UPDATE public.project_stakeholders s SET project_id = p_keep_id
  WHERE s.project_id = p_duplicate_id
    AND NOT EXISTS (SELECT 1 FROM public.project_stakeholders k WHERE k.project_id = p_keep_id AND k.name = s.name);

  UPDATE public.project_contacts c SET project_id = p_keep_id
  WHERE c.project_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM public.project_contacts k
      WHERE k.project_id = p_keep_id
        AND lower(COALESCE(k.name, '')) = lower(COALESCE(c.name, ''))
        AND lower(COALESCE(k.email, '')) = lower(COALESCE(c.email, ''))
    );

  UPDATE public.tracked_projects t SET project_id = p_keep_id
  WHERE t.project_id = p_duplicate_id
    AND NOT EXISTS (SELECT 1 FROM public.tracked_projects k WHERE k.project_id = p_keep_id AND k.user_id = t.user_id);

  UPDATE public.company_project_roles r SET project_id = p_keep_id
  WHERE r.project_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM public.company_project_roles k
      WHERE k.project_id = p_keep_id AND k.company_id = r.company_id AND k.role IS NOT DISTINCT FROM r.role
    );

  -- Keep the strongest known values from either record.
  UPDATE public.projects p
  SET confidence = GREATEST(COALESCE(p.confidence, 0), COALESCE(v_dup.confidence, 0)),
      stage = CASE WHEN public._stage_rank(v_dup.stage) > public._stage_rank(p.stage) THEN v_dup.stage ELSE p.stage END,
      status = CASE WHEN public._status_rank(v_dup.status) > public._status_rank(p.status) THEN v_dup.status ELSE p.status END,
      value_usd = CASE WHEN COALESCE(p.value_usd, 0) = 0 THEN v_dup.value_usd ELSE p.value_usd END,
      value_label = CASE WHEN COALESCE(p.value_usd, 0) = 0 AND COALESCE(v_dup.value_usd, 0) > 0 THEN v_dup.value_label ELSE p.value_label END,
      description = CASE WHEN length(COALESCE(v_dup.description, '')) > length(COALESCE(p.description, '')) THEN v_dup.description ELSE p.description END,
      timeline = COALESCE(NULLIF(p.timeline, ''), v_dup.timeline),
      source_url = CASE WHEN COALESCE(p.source_url, '') NOT LIKE 'http%' THEN v_dup.source_url ELSE p.source_url END,
      lat = CASE WHEN COALESCE(p.lat, 0) = 0 THEN v_dup.lat ELSE p.lat END,
      lng = CASE WHEN COALESCE(p.lng, 0) = 0 THEN v_dup.lng ELSE p.lng END,
      last_updated = now()
  WHERE p.id = p_keep_id;

  DELETE FROM public.projects WHERE id = p_duplicate_id;

  INSERT INTO public.project_verification_log (project_id, action, reason, performed_by)
  VALUES (p_keep_id, 'merged_duplicate',
          COALESCE(p_reason, 'Automatic duplicate merge') || ' (absorbed "' || v_dup.name || '")', v_actor);

  RETURN jsonb_build_object('merged', true, 'kept', p_keep_id, 'removed', p_duplicate_id);
END;
$$;

-- Find and merge duplicate groups: identical normalised name AND country.
CREATE OR REPLACE FUNCTION public.merge_duplicate_projects(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group record;
  v_keep uuid;
  v_dup uuid;
  v_merged integer := 0;
  v_groups integer := 0;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL
     AND NOT (public.has_role(v_actor, 'admin'::public.app_role) OR public.has_role(v_actor, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  FOR v_group IN
    SELECT public.normalize_project_key(name) AS key, lower(trim(COALESCE(country, ''))) AS ctry
    FROM public.projects
    GROUP BY 1, 2
    HAVING count(*) > 1
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000))
  LOOP
    v_groups := v_groups + 1;
    SELECT id INTO v_keep FROM public.projects
    WHERE public.normalize_project_key(name) = v_group.key
      AND lower(trim(COALESCE(country, ''))) = v_group.ctry
    ORDER BY (CASE WHEN COALESCE(source_url, '') LIKE 'http%' THEN 1 ELSE 0 END) DESC,
             approved DESC, confidence DESC NULLS LAST, created_at ASC
    LIMIT 1;

    FOR v_dup IN
      SELECT id FROM public.projects
      WHERE public.normalize_project_key(name) = v_group.key
        AND lower(trim(COALESCE(country, ''))) = v_group.ctry
        AND id <> v_keep
    LOOP
      BEGIN
        IF (public.merge_project_pair(v_keep, v_dup, 'Automatic duplicate merge')->>'merged')::boolean THEN
          v_merged := v_merged + 1;
        END IF;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('duplicate_groups', v_groups, 'projects_merged', v_merged);
END;
$$;

REVOKE ALL ON FUNCTION public.update_proposal_auto_decision(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.auto_apply_update_proposal(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.auto_apply_pending_update_proposals(integer) FROM anon;
REVOKE ALL ON FUNCTION public.merge_project_pair(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.merge_duplicate_projects(integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_proposal_auto_decision(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_apply_update_proposal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_apply_pending_update_proposals(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_project_pair(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_projects(integer) TO authenticated, service_role;