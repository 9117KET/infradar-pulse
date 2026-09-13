-- Also treat records that share a name AND the exact same source page as
-- duplicates, and run both automations on a schedule.

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
  v_same_name boolean;
  v_same_country boolean;
  v_same_source boolean;
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

  v_same_name := public.normalize_project_key(v_keep.name) = public.normalize_project_key(v_dup.name);
  v_same_country := lower(trim(COALESCE(v_keep.country, ''))) = lower(trim(COALESCE(v_dup.country, '')));
  v_same_source := COALESCE(v_keep.source_url, '') LIKE 'http%'
                   AND v_keep.source_url = v_dup.source_url;

  IF NOT v_same_name OR NOT (v_same_country OR v_same_source) THEN
    RETURN jsonb_build_object('merged', false, 'reason', 'not_a_duplicate');
  END IF;

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
  UPDATE public.agent_escalations SET project_id = p_keep_id WHERE project_id = p_duplicate_id;

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

-- Second pass: same name + identical source page, even when the country label
-- differs. A conflict between two specific country labels is escalated.
CREATE OR REPLACE FUNCTION public.merge_duplicate_projects_by_source(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group record;
  v_keep public.projects%ROWTYPE;
  v_dup public.projects%ROWTYPE;
  v_merged integer := 0;
  v_groups integer := 0;
  v_escalated integer := 0;
  v_generic text := '(multi|region|pan|international|global|world|various|africa$|asia$|europe$)';
  v_res jsonb;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL
     AND NOT (public.has_role(v_actor, 'admin'::public.app_role) OR public.has_role(v_actor, 'researcher'::public.app_role)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  FOR v_group IN
    SELECT public.normalize_project_key(name) AS key, source_url, count(*) AS n
    FROM public.projects
    WHERE source_url LIKE 'http%'
    GROUP BY 1, 2
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000))
  LOOP
    v_groups := v_groups + 1;

    SELECT * INTO v_keep FROM public.projects
    WHERE public.normalize_project_key(name) = v_group.key AND source_url = v_group.source_url
    ORDER BY approved DESC, confidence DESC NULLS LAST, created_at ASC
    LIMIT 1;

    FOR v_dup IN
      SELECT * FROM public.projects
      WHERE public.normalize_project_key(name) = v_group.key AND source_url = v_group.source_url
        AND id <> v_keep.id
    LOOP
      -- Two different specific countries on the same page: a person decides.
      IF lower(trim(COALESCE(v_keep.country, ''))) <> lower(trim(COALESCE(v_dup.country, '')))
         AND lower(COALESCE(v_keep.country, '')) !~ v_generic
         AND lower(COALESCE(v_dup.country, '')) !~ v_generic THEN
        PERFORM public.escalate_to_human(
          'duplicate_merge', 'country_conflict',
          'Two records named "' || v_keep.name || '" cite the same source page but different countries ('
            || COALESCE(v_keep.country, '?') || ' vs ' || COALESCE(v_dup.country, '?') || ').',
          'medium', 'project', v_dup.id, v_keep.id,
          jsonb_build_object('source_url', v_group.source_url)
        );
        v_escalated := v_escalated + 1;
        CONTINUE;
      END IF;

      BEGIN
        v_res := public.merge_project_pair(v_keep.id, v_dup.id, 'Automatic duplicate merge (same name and source page)');
        IF (v_res->>'merged')::boolean THEN
          v_merged := v_merged + 1;
        ELSE
          PERFORM public.escalate_to_human(
            'duplicate_merge', COALESCE(v_res->>'reason', 'merge_declined'),
            'A suspected duplicate of "' || v_keep.name || '" could not be merged automatically.',
            'medium', 'project', v_dup.id, v_keep.id, '{}'::jsonb
          );
          v_escalated := v_escalated + 1;
        END IF;
      EXCEPTION WHEN others THEN
        PERFORM public.escalate_to_human(
          'duplicate_merge', 'merge_failed',
          'Merging a suspected duplicate of "' || v_keep.name || '" failed: ' || left(SQLERRM, 300),
          'high', 'project', v_dup.id, v_keep.id, '{}'::jsonb
        );
        v_escalated := v_escalated + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('duplicate_groups', v_groups, 'projects_merged', v_merged, 'escalated', v_escalated);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_project_pair(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_duplicate_projects_by_source(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_project_pair(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_projects_by_source(integer) TO authenticated, service_role;

-- Scheduled runs (pure SQL, no HTTP credentials involved).
SELECT cron.unschedule(jobid) FROM cron.job
WHERE jobname IN ('auto-apply-update-proposals', 'auto-merge-duplicate-projects');

SELECT cron.schedule('auto-apply-update-proposals', '20 * * * *',
  $$SELECT public.auto_apply_pending_update_proposals(400);$$);

SELECT cron.schedule('auto-merge-duplicate-projects', '50 3 * * *',
  $$SELECT public.merge_duplicate_projects(200), public.merge_duplicate_projects_by_source(200);$$);