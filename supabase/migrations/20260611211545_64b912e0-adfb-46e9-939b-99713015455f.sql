-- Atomic failure counter increment to remove read-then-write race
create or replace function public.xml_feed_increment_failures(_feed_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.xml_feeds
  set consecutive_failures = coalesce(consecutive_failures, 0) + 1
  where id = _feed_id;
$$;

revoke all on function public.xml_feed_increment_failures(uuid) from public, anon, authenticated;
grant execute on function public.xml_feed_increment_failures(uuid) to service_role;

-- Generate and store a strong cron secret in app_secrets (idempotent: only inserts if missing)
insert into public.app_secrets(key, value, updated_at)
values ('xml_cron_secret', encode(gen_random_bytes(32), 'hex'), now())
on conflict (key) do nothing;
