DROP FUNCTION IF EXISTS public.admin_list_user_emails();

CREATE FUNCTION public.admin_list_user_emails()
RETURNS TABLE(user_id uuid, email text, email_confirmed_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, u.email_confirmed_at
  FROM auth.users u;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated;