-- Atomic increment for the public Ask AI demo rate limit.
--
-- Replaces the previous read-then-upsert in the `nl-search-public` Edge Function
-- (which could lose updates under concurrent requests and made the per-IP counter
-- appear "stuck"). A single INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING is
-- atomic, so the returned count is always the true post-increment value.

create or replace function public.increment_demo_quota(p_ip_hash text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.public_demo_rate_limits (ip_hash, query_date, count)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, query_date)
  do update set count = public.public_demo_rate_limits.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

-- Only the service-role Edge Function should call this. Lock out anon/authenticated.
revoke all on function public.increment_demo_quota(text) from public;
revoke all on function public.increment_demo_quota(text) from anon;
revoke all on function public.increment_demo_quota(text) from authenticated;
