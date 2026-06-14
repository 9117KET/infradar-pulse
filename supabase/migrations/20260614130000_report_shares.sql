-- Shareable public report links.
--
-- Lets a user publish one of their AI report_runs as a read-only public link
-- (top-of-funnel growth: a pilot shares a report, recipients see the product).
--
-- Security model: no broad anonymous RLS on report_runs. Anonymous access goes
-- exclusively through the SECURITY DEFINER function get_shared_report(token),
-- which returns ONLY the display fields of a single, non-revoked, completed
-- report whose token matches. Tokens are random and unguessable. Only the report
-- owner can create or revoke a share.

CREATE TABLE IF NOT EXISTS public.report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_shares_token ON public.report_shares(token);
CREATE INDEX IF NOT EXISTS idx_report_shares_owner ON public.report_shares(created_by, report_run_id);

ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;

-- Owners manage their own shares. No anon policy — anon never touches this table
-- directly (only via the SECURITY DEFINER resolver below).
DROP POLICY IF EXISTS "owners manage own report_shares" ON public.report_shares;
CREATE POLICY "owners manage own report_shares" ON public.report_shares
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Create (or reuse) a share for a report the caller owns. Returns the token.
CREATE OR REPLACE FUNCTION public.create_report_share(p_report_run_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  -- Only the owner of a completed report may share it.
  IF NOT EXISTS (
    SELECT 1 FROM public.report_runs
    WHERE id = p_report_run_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE = 'P0001';
  END IF;

  -- Reuse an existing active share so re-clicking "Share" returns a stable link.
  SELECT token INTO v_token
  FROM public.report_shares
  WHERE report_run_id = p_report_run_id AND created_by = auth.uid() AND NOT revoked
  LIMIT 1;

  IF v_token IS NULL THEN
    INSERT INTO public.report_shares (report_run_id, created_by)
    VALUES (p_report_run_id, auth.uid())
    RETURNING token INTO v_token;
  END IF;

  RETURN v_token;
END;
$$;

-- Owner revokes a share (link stops working).
CREATE OR REPLACE FUNCTION public.revoke_report_share(p_report_run_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.report_shares
  SET revoked = true
  WHERE report_run_id = p_report_run_id AND created_by = auth.uid();
$$;

-- Anonymous resolver: token -> public-safe report fields for one valid share.
-- Returns no rows for unknown/revoked tokens or non-completed reports.
CREATE OR REPLACE FUNCTION public.get_shared_report(p_token text)
RETURNS TABLE(title text, markdown text, report_type text, citations jsonb, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.title, r.markdown, r.report_type, r.citations, r.created_at
  FROM public.report_shares s
  JOIN public.report_runs r ON r.id = s.report_run_id
  WHERE s.token = p_token
    AND s.revoked = false
    AND r.status = 'completed'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.create_report_share(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_report_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_report_share(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_report_share(uuid) TO authenticated;
-- Public link resolver is callable by anonymous visitors.
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;
