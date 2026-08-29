create table if not exists public.support_chats (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  messages jsonb not null default '[]'::jsonb,
  message_count int not null default 0,
  live_requested boolean not null default false,
  satisfaction smallint,
  resolved boolean not null default false,
  last_user_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_chats_session on public.support_chats(session_id);
create index if not exists idx_support_chats_user on public.support_chats(user_id);
create index if not exists idx_support_chats_created on public.support_chats(created_at desc);

grant select, insert, update on public.support_chats to anon, authenticated;
grant all on public.support_chats to service_role;
alter table public.support_chats enable row level security;

drop policy if exists "chats insert own session" on public.support_chats;
create policy "chats insert own session" on public.support_chats for insert to anon, authenticated with check (true);
drop policy if exists "chats update own" on public.support_chats;
create policy "chats update own" on public.support_chats for update to anon, authenticated using (true) with check (true);
drop policy if exists "chats select own" on public.support_chats;
create policy "chats select own" on public.support_chats for select to anon, authenticated
using ((user_id is not null and user_id = auth.uid()) or public.has_role(auth.uid(), 'admin'));

create table if not exists public.support_live_requests (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.support_chats(id) on delete set null,
  session_id text,
  user_id uuid references auth.users(id) on delete set null,
  name text,
  contact text not null,
  message text not null,
  status text not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_live_created on public.support_live_requests(created_at desc);

grant select, insert on public.support_live_requests to anon, authenticated;
grant all on public.support_live_requests to service_role;
alter table public.support_live_requests enable row level security;

drop policy if exists "live req insert any" on public.support_live_requests;
create policy "live req insert any" on public.support_live_requests for insert to anon, authenticated with check (true);
drop policy if exists "live req admin read" on public.support_live_requests;
create policy "live req admin read" on public.support_live_requests for select to authenticated using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "live req admin update" on public.support_live_requests;
create policy "live req admin update" on public.support_live_requests for update to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.admin_support_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'not authorized'; end if;
  select jsonb_build_object(
    'chats_today', (select count(*) from public.support_chats where created_at >= now() - interval '24 hours'),
    'chats_total', (select count(*) from public.support_chats),
    'resolved_today', (select count(*) from public.support_chats where resolved and updated_at >= now() - interval '24 hours'),
    'live_requests_today', (select count(*) from public.support_live_requests where created_at >= now() - interval '24 hours'),
    'live_requests_open', (select count(*) from public.support_live_requests where status = 'new'),
    'avg_satisfaction', (select round(avg(satisfaction)::numeric, 2) from public.support_chats where satisfaction is not null),
    'recent_chats', (select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select id, session_id, user_id, message_count, last_user_message, live_requested, resolved, satisfaction, created_at, updated_at
        from public.support_chats order by updated_at desc limit 100) t),
    'live_requests_recent', (select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select id, chat_id, name, contact, message, status, created_at
        from public.support_live_requests order by created_at desc limit 50) t)
  ) into result;
  return result;
end;
$$;
grant execute on function public.admin_support_stats() to authenticated;