-- Narasannapalem Voter Portal performance improvements.
-- Functions run with the caller's permissions and respect table RLS policies.

-- Cover group membership lookups for both assigned and unassigned voter queries.
create index if not exists voter_group_members_group_text_voter_idx
  on public.voter_group_members ((group_id::text), voter_id);

create index if not exists voter_group_members_voter_id_idx
  on public.voter_group_members (voter_id);

-- Support the portal's stable V.Sno ordering and ward-filtered ordering.
create index if not exists voters_serial_voter_idx
  on public.voters (panchayat_serial_number, voter_id);

create index if not exists voters_ward_serial_voter_idx
  on public.voters (ward_number, panchayat_serial_number, voter_id);


-- Return only the requested community-group page. Filtering, counting,
-- ordering, and pagination are performed by PostgreSQL rather than React.
create or replace function public.get_community_group_voters(
  p_group_id text default null,
  p_unassigned boolean default false,
  p_search text default null,
  p_ward text default null,
  p_page integer default 0,
  p_page_size integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
  with filtered as materialized (
    select v.*
    from public.voters as v
    where
      (
        (
          coalesce(p_unassigned, false)
          and not exists (
            select 1
            from public.voter_group_members as m
            where m.voter_id = v.voter_id
          )
        )
        or
        (
          not coalesce(p_unassigned, false)
          and p_group_id is not null
          and exists (
            select 1
            from public.voter_group_members as m
            where m.voter_id = v.voter_id
              and m.group_id::text = p_group_id
          )
        )
      )
      and (
        nullif(btrim(p_ward), '') is null
        or v.ward_number::text = btrim(p_ward)
      )
      and (
        nullif(btrim(p_search), '') is null
        or coalesce(v.voter_id::text, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(v.english_name::text, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(v.telugu_name::text, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(v.relative_name::text, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(v.relative_name_english::text, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(v.panchayat_serial_number::text, '') ilike '%' || btrim(p_search) || '%'
      )
  ),
  page_rows as (
    select *
    from filtered
    order by panchayat_serial_number asc nulls last, voter_id asc
    offset (
      greatest(coalesce(p_page, 0), 0)
      * least(greatest(coalesce(p_page_size, 20), 1), 100)
    )
    limit least(greatest(coalesce(p_page_size, 20), 1), 100)
  )
  select jsonb_build_object(
    'total_count', (select count(*) from filtered),
    'rows', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'voter_id', page_rows.voter_id,
            'telugu_name', page_rows.telugu_name,
            'english_name', page_rows.english_name,
            'age', page_rows.age,
            'gender', page_rows.gender,
            'ward_number', page_rows.ward_number,
            'house_number', page_rows.house_number,
            'relationship_type', page_rows.relationship_type,
            'relative_name', page_rows.relative_name,
            'panchayat_serial_number', page_rows.panchayat_serial_number,
            'relative_name_english', page_rows.relative_name_english
          )
        )
        from page_rows
      ),
      '[]'::jsonb
    )
  );
$function$;

revoke all on function public.get_community_group_voters(text, boolean, text, text, integer, integer)
  from public, anon;
grant execute on function public.get_community_group_voters(text, boolean, text, text, integer, integer)
  to authenticated;


-- Aggregate ward totals in PostgreSQL. This replaces downloading every voter
-- row solely to calculate totals in the browser.
create or replace function public.get_ward_stats()
returns table (
  ward_number text,
  total_voters bigint,
  male_voters bigint,
  female_voters bigint
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    v.ward_number::text,
    count(*)::bigint,
    count(*) filter (
      where lower(btrim(coalesce(v.gender::text, ''))) = 'male'
    )::bigint,
    count(*) filter (
      where lower(btrim(coalesce(v.gender::text, ''))) = 'female'
    )::bigint
  from public.voters as v
  group by v.ward_number
  order by v.ward_number;
$function$;

revoke all on function public.get_ward_stats() from public, anon;
grant execute on function public.get_ward_stats() to authenticated;
