-- Security hardening for RLS policies, role management, function execution, and function search paths.

ALTER TABLE public.projects ALTER COLUMN approved SET DEFAULT false;

DROP POLICY IF EXISTS "Staff can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Staff can update projects" ON public.projects;
DROP POLICY IF EXISTS "Staff can delete projects" ON public.projects;
CREATE POLICY "Staff can insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can update projects" ON public.projects FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can delete projects" ON public.projects FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Staff can insert stakeholders" ON public.project_stakeholders;
DROP POLICY IF EXISTS "Staff can update stakeholders" ON public.project_stakeholders;
DROP POLICY IF EXISTS "Staff can delete stakeholders" ON public.project_stakeholders;
CREATE POLICY "Staff can insert stakeholders" ON public.project_stakeholders FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can update stakeholders" ON public.project_stakeholders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can delete stakeholders" ON public.project_stakeholders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Staff can insert milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Staff can update milestones" ON public.project_milestones;
DROP POLICY IF EXISTS "Staff can delete milestones" ON public.project_milestones;
CREATE POLICY "Staff can insert milestones" ON public.project_milestones FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can update milestones" ON public.project_milestones FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can delete milestones" ON public.project_milestones FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Staff can insert evidence" ON public.evidence_sources;
DROP POLICY IF EXISTS "Staff can update evidence" ON public.evidence_sources;
DROP POLICY IF EXISTS "Staff can delete evidence" ON public.evidence_sources;
CREATE POLICY "Staff can insert evidence" ON public.evidence_sources FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can update evidence" ON public.evidence_sources FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can delete evidence" ON public.evidence_sources FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Staff can insert contacts" ON public.project_contacts;
DROP POLICY IF EXISTS "Staff can update contacts" ON public.project_contacts;
DROP POLICY IF EXISTS "Staff can delete contacts" ON public.project_contacts;
CREATE POLICY "Staff can insert contacts" ON public.project_contacts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can update contacts" ON public.project_contacts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can delete contacts" ON public.project_contacts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Staff can insert insights" ON public.insights;
DROP POLICY IF EXISTS "Staff can update insights" ON public.insights;
DROP POLICY IF EXISTS "Staff can delete insights" ON public.insights;
CREATE POLICY "Staff can insert insights" ON public.insights FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can update insights" ON public.insights FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));
CREATE POLICY "Staff can delete insights" ON public.insights FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'researcher'::public.app_role));

DROP POLICY IF EXISTS "Admins can read email send log" ON public.email_send_log;
CREATE POLICY "Admins can read email send log" ON public.email_send_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'user and role are required' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role);
  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'role', p_role);
END;
$$;

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "Anyone can subscribe" ON public.subscribers;
CREATE POLICY "Anyone can subscribe" ON public.subscribers FOR INSERT TO anon, authenticated WITH CHECK (length(trim(email)) BETWEEN 3 AND 255 AND email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' AND (name IS NULL OR length(trim(name)) <= 120) AND (company IS NULL OR length(trim(company)) <= 160) AND length(trim(type)) BETWEEN 1 AND 50);

DROP POLICY IF EXISTS "Anyone can insert waitlist" ON public.waitlist;
CREATE POLICY "Anyone can insert waitlist" ON public.waitlist FOR INSERT TO anon, authenticated WITH CHECK (length(trim(email)) BETWEEN 3 AND 255 AND email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' AND (name IS NULL OR length(trim(name)) <= 120) AND (company IS NULL OR length(trim(company)) <= 160) AND (role IS NULL OR length(trim(role)) <= 120) AND (company_size IS NULL OR length(trim(company_size)) <= 80) AND (interest IS NULL OR length(trim(interest)) <= 500) AND (challenge IS NULL OR length(trim(challenge)) <= 1000));

REVOKE EXECUTE ON FUNCTION public.admin_grant_pilot_access(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_emails() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_pilot_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pilot_access_summary(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_traction_stats() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_own_pilot_access(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_pilot_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_pilot_access(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_pilot_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pilot_access_summary(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_traction_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_own_pilot_access(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_pilot_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_pilot_access_counter(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;