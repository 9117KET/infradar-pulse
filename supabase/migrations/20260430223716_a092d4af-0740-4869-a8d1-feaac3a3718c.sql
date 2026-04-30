-- Schedule the 7 monitor agents with MVP-friendly cadences
SELECT cron.schedule('regulatory-monitor', '0 */6 * * *',
  $$ SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/regulatory-monitor',
    headers := public._agent_cron_auth_header(),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 120000
  ); $$);

SELECT cron.schedule('supply-chain-monitor', '15 */8 * * *',
  $$ SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/supply-chain-monitor',
    headers := public._agent_cron_auth_header(),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 120000
  ); $$);

SELECT cron.schedule('stakeholder-intel', '30 8,20 * * *',
  $$ SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/stakeholder-intel',
    headers := public._agent_cron_auth_header(),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 120000
  ); $$);

SELECT cron.schedule('corporate-ma-monitor', '45 */12 * * *',
  $$ SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/corporate-ma-monitor',
    headers := public._agent_cron_auth_header(),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 120000
  ); $$);

SELECT cron.schedule('esg-social-monitor', '0 6,18 * * *',
  $$ SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/esg-social-monitor',
    headers := public._agent_cron_auth_header(),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 120000
  ); $$);

SELECT cron.schedule('tender-award-monitor', '20 */8 * * *',
  $$ SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/tender-award-monitor',
    headers := public._agent_cron_auth_header(),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 120000
  ); $$);

SELECT cron.schedule('security-resilience', '50 */12 * * *',
  $$ SELECT net.http_post(
    url := 'https://yofglpxqpouqqhkidlkx.supabase.co/functions/v1/security-resilience',
    headers := public._agent_cron_auth_header(),
    body := '{"scheduled": true}'::jsonb,
    timeout_milliseconds := 120000
  ); $$);