create table if not exists public.user_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 4194304),
  updated_at timestamptz not null default now()
);

alter table public.user_states enable row level security;

revoke all on public.user_states from anon, authenticated;
grant select, insert, update on public.user_states to authenticated;

drop policy if exists "Users can read their own state" on public.user_states;
create policy "Users can read their own state"
  on public.user_states for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own state" on public.user_states;
create policy "Users can insert their own state"
  on public.user_states for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own state" on public.user_states;
create policy "Users can update their own state"
  on public.user_states for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
