create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth_key text,
  platform text not null default 'web' check (platform in ('web','android','ios')),
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

alter table public.push_subscriptions enable row level security;

create policy "users manage own push subs"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
