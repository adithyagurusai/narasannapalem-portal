do $$
declare
  duplicate_names text;
begin
  select string_agg(
    format('%L (%s accounts)', display_name, account_count),
    ', '
  )
  into duplicate_names
  from (
    select min(display_name) as display_name, count(*) as account_count
    from public.profiles
    where display_name is not null
    group by lower(btrim(display_name))
    having count(*) > 1
  ) duplicates;

  if duplicate_names is not null then
    raise exception
      'Cannot enforce unique login names; resolve duplicate profile display_name values first: %',
      duplicate_names;
  end if;
end
$$;

create unique index profiles_display_name_login_unique
  on public.profiles (lower(btrim(display_name)));

create or replace function public.resolve_login_profile(p_display_name text)
returns table (id uuid, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.id, profiles.is_active
  from public.profiles
  where pg_catalog.lower(pg_catalog.btrim(profiles.display_name)) =
    pg_catalog.lower(pg_catalog.btrim(p_display_name))
  limit 1
$$;

revoke all on function public.resolve_login_profile(text) from public;
revoke all on function public.resolve_login_profile(text) from anon, authenticated;
grant execute on function public.resolve_login_profile(text) to service_role;
