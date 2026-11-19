-- Portal device/session tracking and server-enforced session revocation.
-- Run this migration before deploying the updated frontend and manage-users Edge Function.

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text not null default 'Unknown device',
  browser text not null default 'Unknown',
  operating_system text not null default 'Unknown',
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  revoked_at timestamptz
);

create index if not exists user_sessions_user_last_seen_idx
  on public.user_sessions (user_id, last_seen_at desc);

create index if not exists user_sessions_active_idx
  on public.user_sessions (user_id, expires_at)
  where revoked_at is null;

alter table public.user_sessions enable row level security;
revoke all on table public.user_sessions from anon, authenticated;
grant all on table public.user_sessions to service_role;

-- The JWT session_id claim ties each browser login to exactly one row.
-- SECURITY DEFINER allows this predicate to read user_sessions even though
-- ordinary authenticated clients cannot query that table directly.
create or replace function public.is_portal_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_sessions as s
    where s.user_id = auth.uid()
      and s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.revoked_at is null
      and s.expires_at > now()
      and exists (
        select 1
        from public.profiles as p
        where p.id = s.user_id
          and p.is_active is true
      )
  );
$$;

revoke all on function public.is_portal_session_active() from public, anon;
grant execute on function public.is_portal_session_active() to authenticated, service_role;

-- Add a restrictive guard without replacing the application's existing
-- permissive table policies. Tables without RLS are reported for manual review.
do $$
declare
  table_name text;
  target_tables text[] := array[
    'profiles',
    'voters',
    'voter_groups',
    'voter_group_members'
  ];
  table_has_rls boolean;
  has_permissive_policy boolean;
begin
  foreach table_name in array target_tables loop
    select c.relrowsecurity
      into table_has_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = table_name
      and c.relkind = 'r';

    if table_has_rls is false then
      select exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = table_name
          and permissive = 'PERMISSIVE'
      )
      into has_permissive_policy;

      if has_permissive_policy then
        execute format('alter table public.%I enable row level security', table_name);
        table_has_rls := true;
      end if;
    end if;

    if table_has_rls is true then
      execute format(
        'drop policy if exists portal_session_guard on public.%I',
        table_name
      );
      execute format(
        'create policy portal_session_guard on public.%I
           as restrictive
           for all
           to authenticated
           using (public.is_portal_session_active())
           with check (public.is_portal_session_active())',
        table_name
      );
    else
      raise exception
        'Cannot enforce session revocation: RLS is not enabled on public.%. Enable RLS and preserve its intended access policies before applying this migration.',
        table_name;
    end if;
  end loop;
end
$$;


-- Voter photos are requested through signed URLs. Require an active portal
-- session when creating/accessing storage objects through authenticated APIs.
drop policy if exists portal_session_guard_voter_photos on storage.objects;
create policy portal_session_guard_voter_photos
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (
    bucket_id <> 'voter-photos'
    or public.is_portal_session_active()
  )
  with check (
    bucket_id <> 'voter-photos'
    or public.is_portal_session_active()
  );
