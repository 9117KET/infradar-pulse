-- lovable-cron-fallback-reviewed: 96 runs/day; user schedules can be due at arbitrary times, so a 15-minute delivery window is needed for predictable recurring reports.
DO $$
BEGIN
  PERFORM cron.unschedule(60);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'report-scheduler',
  '*/15 * * * *',
  format($q$SELECT net.http_post(url:='%s/report-scheduler', headers:='%s'::jsonb, body:='{}'::jsonb)$q$,
    'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1',
    public._agent_cron_auth_header()
  )
);