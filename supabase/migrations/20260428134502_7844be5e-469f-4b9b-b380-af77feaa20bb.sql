REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.has_paid_or_staff_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_paid_or_staff_access(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.has_paid_or_staff_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_paid_or_staff_access(uuid) TO authenticated;