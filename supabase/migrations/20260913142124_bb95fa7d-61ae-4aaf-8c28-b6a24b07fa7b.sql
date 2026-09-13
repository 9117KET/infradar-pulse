-- Escalation-aware automation: anything the rules cannot safely decide becomes a
-- human review item instead of being silently applied or silently dropped.

CREATE OR REPLACE FUNCTION public.auto_apply_update_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_decision jsonb;
  v_changes jsonb;
  v_reason text;
  v_p public.update_proposals%ROWTYPE;
  v_proj public.projects%ROWTYPE;
  v_key text;
  v_val jsonb;
  v_actor uuid := auth.uid();
  v_sev text;
BEGIN
  IF v_actor IS NOT NULL
     AND NOT (public.has_role(v_actor, 'admin'::public.app_role) OR public.has_role(v_actor, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM public.update_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied', false, 'reason', 'proposal_not_found'); END IF;

  v_decision := public.update_proposal_auto_decision(p_proposal_id);

  IF NOT (v_decision->>'eligible')::boolean THEN
    v_reason := v_decision->>'reason';

    -- Nothing left to change: retire the proposal rather than leaving noise in
    -- the review queue.
    IF v_reason = 'no_net_improvement' THEN
      UPDATE public.update_proposals
      SET status = 'superseded', reviewed_by = v_actor, reviewed_at = now()
      WHERE id = p_proposal_id;
      RETURN jsonb_build_object('applied', false, 'reason', v_reason, 'escalated', false);
    END IF;

    IF v_reason IN ('proposal_not_pending', 'proposal_not_found', 'project_not_found') THEN
      RETURN jsonb_build_object('applied', false, 'reason', v_reason, 'escalated', false);
    END IF;

    -- Everything else is a judgement call: hand it to a human.
    v_sev := CASE
      WHEN v_reason IN ('adverse_stage', 'adverse_status', 'stage_regression', 'status_downgrade', 'source_url_conflict') THEN 'high'
      WHEN v_reason IN ('low_confidence', 'no_source_url') THEN 'low'
      ELSE 'medium'
    END;

    PERFORM public.escalate_to_human(
      'update_proposal', v_reason,
      'Automatic approval declined for a proposed update from ' || v_p.proposed_by_agent || '. A person must decide.',
      v_sev, 'update_proposal', p_proposal_id, v_p.project_id,
      jsonb_build_object('field_changes', v_p.field_changes, 'proposal_confidence', v_p.confidence, 'source_url', v_p.source_url)
    );

    RETURN jsonb_build_object('applied', false, 'reason', v_reason, 'escalated', true);
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

  RETURN jsonb_build_object('applied', true, 'project_id', v_proj.id, 'changes', v_changes, 'escalated', false);
END;
$$;

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
  v_escalated integer := 0;
  v_skipped integer := 0;
  v_errors integer := 0;
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
        IF COALESCE((v_res->>'escalated')::boolean, false) THEN v_escalated := v_escalated + 1; END IF;
        v_reason := COALESCE(v_res->>'reason', 'unknown');
        v_reasons := jsonb_set(v_reasons, ARRAY[v_reason],
          to_jsonb(COALESCE((v_reasons->>v_reason)::integer, 0) + 1), true);
      END IF;
    EXCEPTION WHEN others THEN
      v_errors := v_errors + 1;
      v_skipped := v_skipped + 1;
      PERFORM public.escalate_to_human(
        'update_proposal', 'apply_failed',
        'A proposed update could not be processed automatically: ' || left(SQLERRM, 300),
        'high', 'update_proposal', v_id, NULL, '{}'::jsonb
      );
    END;
  END LOOP;

  -- A backlog that keeps growing is itself a signal a human should see.
  IF (SELECT count(*) FROM public.update_proposals WHERE status IN ('pending','approved')) > 500 THEN
    PERFORM public.escalate_to_human(
      'update_proposal', 'review_backlog_large',
      'More than 500 proposed updates are waiting for review.',
      'medium', 'queue', NULL, NULL,
      jsonb_build_object('pending', (SELECT count(*) FROM public.update_proposals WHERE status IN ('pending','approved')))
    );
  END IF;

  RETURN jsonb_build_object('applied', v_applied, 'left_for_review', v_skipped,
    'escalated', v_escalated, 'errors', v_errors, 'reasons', v_reasons);
END;
$$;

-- Duplicate merging with the same escalate-instead-of-guess rule.
CREATE OR REPLACE FUNCTION public.merge_duplicate_projects(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group record;
  v_keep uuid;
  v_keep_row public.projects%ROWTYPE;
  v_dup_row public.projects%ROWTYPE;
  v_merged integer := 0;
  v_groups integer := 0;
  v_escalated integer := 0;
  v_group_size integer;
  v_res jsonb;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL
     AND NOT (public.has_role(v_actor, 'admin'::public.app_role) OR public.has_role(v_actor, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  FOR v_group IN
    SELECT public.normalize_project_key(name) AS key,
           lower(trim(COALESCE(country, ''))) AS ctry,
           count(*) AS n
    FROM public.projects
    GROUP BY 1, 2
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000))
  LOOP
    v_groups := v_groups + 1;
    v_group_size := v_group.n;

    -- An unusually large cluster is more likely a generic name than one project.
    IF v_group_size > 3 THEN
      PERFORM public.escalate_to_human(
        'duplicate_merge', 'large_duplicate_cluster',
        v_group_size || ' records share the name "' || v_group.key || '" in the same country. Merging automatically is unsafe.',
        'medium', 'project_group', NULL, NULL,
        jsonb_build_object('normalized_name', v_group.key, 'country', v_group.ctry, 'count', v_group_size)
      );
      v_escalated := v_escalated + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_keep_row FROM public.projects
    WHERE public.normalize_project_key(name) = v_group.key
      AND lower(trim(COALESCE(country, ''))) = v_group.ctry
    ORDER BY (CASE WHEN COALESCE(source_url, '') LIKE 'http%' THEN 1 ELSE 0 END) DESC,
             approved DESC, confidence DESC NULLS LAST, created_at ASC
    LIMIT 1;
    v_keep := v_keep_row.id;

    FOR v_dup_row IN
      SELECT * FROM public.projects
      WHERE public.normalize_project_key(name) = v_group.key
        AND lower(trim(COALESCE(country, ''))) = v_group.ctry
        AND id <> v_keep
    LOOP
      -- Materially different headline values mean these may be separate phases.
      IF COALESCE(v_keep_row.value_usd, 0) > 0 AND COALESCE(v_dup_row.value_usd, 0) > 0
         AND abs(v_keep_row.value_usd - v_dup_row.value_usd)
             > 0.25 * GREATEST(v_keep_row.value_usd, v_dup_row.value_usd) THEN
        PERFORM public.escalate_to_human(
          'duplicate_merge', 'value_mismatch',
          'Two records named "' || v_keep_row.name || '" in ' || COALESCE(v_keep_row.country, 'an unknown country')
            || ' report very different values, so they were not merged automatically.',
          'medium', 'project', v_dup_row.id, v_keep,
          jsonb_build_object('keep_value_usd', v_keep_row.value_usd, 'duplicate_value_usd', v_dup_row.value_usd)
        );
        v_escalated := v_escalated + 1;
        CONTINUE;
      END IF;

      BEGIN
        v_res := public.merge_project_pair(v_keep, v_dup_row.id, 'Automatic duplicate merge');
        IF (v_res->>'merged')::boolean THEN
          v_merged := v_merged + 1;
        ELSE
          PERFORM public.escalate_to_human(
            'duplicate_merge', COALESCE(v_res->>'reason', 'merge_declined'),
            'A suspected duplicate of "' || v_keep_row.name || '" could not be merged automatically.',
            'medium', 'project', v_dup_row.id, v_keep, '{}'::jsonb
          );
          v_escalated := v_escalated + 1;
        END IF;
      EXCEPTION WHEN others THEN
        PERFORM public.escalate_to_human(
          'duplicate_merge', 'merge_failed',
          'Merging a suspected duplicate of "' || v_keep_row.name || '" failed: ' || left(SQLERRM, 300),
          'high', 'project', v_dup_row.id, v_keep, '{}'::jsonb
        );
        v_escalated := v_escalated + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('duplicate_groups', v_groups, 'projects_merged', v_merged, 'escalated', v_escalated);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_apply_update_proposal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_apply_pending_update_proposals(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_duplicate_projects(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_apply_update_proposal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_apply_pending_update_proposals(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_projects(integer) TO authenticated, service_role;