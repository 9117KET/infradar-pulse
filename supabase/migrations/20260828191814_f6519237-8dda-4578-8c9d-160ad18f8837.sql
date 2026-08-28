ALTER VIEW public.cron_http_failures SET (security_invoker = true);
REVOKE ALL ON public.cron_http_failures FROM anon, authenticated;