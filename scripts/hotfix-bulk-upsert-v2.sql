-- Paste into SQL Editor and Run. Safe to re-run (CREATE OR REPLACE).
-- Sprint 3.x — bulk_upsert_people v2.
--
-- Two bugs in the original (migration 7):
--
-- 1) Path 2 (rows with dedup_key only, no public linkedin_url) silently
--    skipped existing duplicates via `not exists` instead of doing an upsert.
--    Result: operator re-imports a CSV, rows that should have received new
--    fields (linkedin_hash_id, public_identifier) from the second pass
--    remained NULL forever.
--
-- 2) Path 2's INSERT column list dropped `linkedin_hash_id` and
--    `public_identifier` entirely. Every row inserted via the dedup_key
--    path had both columns NULL, breaking downstream lookups
--    (link_audience_members couldn't find them by hash).
--
-- Fix: rewrite path 2 as an UPSERT-by-dedup_key — UPDATE when the key
-- matches (coalesce-merging into gaps), INSERT otherwise. Include
-- linkedin_hash_id + public_identifier in both the INSERT and UPDATE.
-- Return value semantics preserved.

create or replace function public.bulk_upsert_people(p_rows jsonb)
returns table(inserted int, matched int, linked_companies int)
language plpgsql security definer set search_path = '' as $$
declare
  v_inserted int := 0;
  v_matched int := 0;
  v_linked int := 0;
  v_dk_inserted int := 0;
  v_dk_updated int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  create temporary table _stage_people (
    linkedin_url      text,
    linkedin_hash_id  text,
    public_identifier text,
    first_name        text,
    last_name         text,
    full_name         text,
    headline          text,
    about             text,
    location          text,
    country           text,
    photo_url         text,
    current_title     text,
    company_linkedin_url text,
    company_domain    text,
    dedup_key         text,
    data_json         jsonb
  ) on commit drop;

  insert into _stage_people
  select
    nullif(r->>'linkedin_url',''),
    nullif(r->>'linkedin_hash_id',''),
    nullif(r->>'public_identifier',''),
    nullif(r->>'first_name',''),
    nullif(r->>'last_name',''),
    nullif(r->>'full_name',''),
    nullif(r->>'headline',''),
    nullif(r->>'about',''),
    nullif(r->>'location',''),
    nullif(r->>'country',''),
    nullif(r->>'photo_url',''),
    nullif(r->>'current_title',''),
    nullif(r->>'company_linkedin_url',''),
    nullif(r->>'company_domain',''),
    nullif(r->>'dedup_key',''),
    coalesce(r->'data_json','{}'::jsonb)
  from jsonb_array_elements(p_rows) as r;

  -- -----------------------------------------------------------------
  -- Path 1: linkedin_url present → ON CONFLICT (linkedin_url) DO UPDATE
  -- -----------------------------------------------------------------
  with up as (
    insert into public.people
      (linkedin_url, linkedin_hash_id, public_identifier, first_name, last_name,
       full_name, headline, about, location, country, photo_url, current_title,
       current_company_id, dedup_key, data_json)
    select
      s.linkedin_url,
      s.linkedin_hash_id,
      s.public_identifier,
      s.first_name,
      s.last_name,
      coalesce(s.full_name, trim(concat_ws(' ', s.first_name, s.last_name))),
      s.headline,
      s.about,
      s.location,
      s.country,
      s.photo_url,
      s.current_title,
      coalesce(
        (select id from public.companies c where c.linkedin_url = s.company_linkedin_url),
        (select id from public.companies c where c.domain = s.company_domain::public.citext)
      ),
      s.dedup_key,
      s.data_json
    from _stage_people s
    where s.linkedin_url is not null
    on conflict (linkedin_url) do update set
      linkedin_hash_id   = coalesce(public.people.linkedin_hash_id,  excluded.linkedin_hash_id),
      public_identifier  = coalesce(public.people.public_identifier, excluded.public_identifier),
      first_name         = coalesce(public.people.first_name,        excluded.first_name),
      last_name          = coalesce(public.people.last_name,         excluded.last_name),
      full_name          = coalesce(public.people.full_name,         excluded.full_name),
      headline           = coalesce(public.people.headline,          excluded.headline),
      about              = coalesce(public.people.about,             excluded.about),
      location           = coalesce(public.people.location,          excluded.location),
      country            = coalesce(public.people.country,           excluded.country),
      photo_url          = coalesce(public.people.photo_url,         excluded.photo_url),
      current_title      = coalesce(public.people.current_title,     excluded.current_title),
      current_company_id = coalesce(public.people.current_company_id, excluded.current_company_id),
      dedup_key          = coalesce(public.people.dedup_key,         excluded.dedup_key),
      data_json          = public.people.data_json || excluded.data_json,
      updated_at         = now()
    returning (xmax = 0) as was_inserted, current_company_id
  )
  select
    count(*) filter (where was_inserted)::int,
    count(*) filter (where not was_inserted)::int,
    count(*) filter (where current_company_id is not null)::int
  into v_inserted, v_matched, v_linked
  from up;

  -- -----------------------------------------------------------------
  -- Path 2: linkedin_url is NULL, but dedup_key is set.
  --   First UPDATE any existing rows that share the key (fills in gaps),
  --   then INSERT those that still aren't present.
  -- -----------------------------------------------------------------

  with updated as (
    update public.people p set
      linkedin_hash_id   = coalesce(p.linkedin_hash_id,   s.linkedin_hash_id),
      public_identifier  = coalesce(p.public_identifier,  s.public_identifier),
      first_name         = coalesce(p.first_name,         s.first_name),
      last_name          = coalesce(p.last_name,          s.last_name),
      full_name          = coalesce(p.full_name,          s.full_name),
      headline           = coalesce(p.headline,           s.headline),
      about              = coalesce(p.about,              s.about),
      location           = coalesce(p.location,           s.location),
      country            = coalesce(p.country,            s.country),
      photo_url          = coalesce(p.photo_url,          s.photo_url),
      current_title      = coalesce(p.current_title,      s.current_title),
      current_company_id = coalesce(
        p.current_company_id,
        (select id from public.companies c where c.linkedin_url = s.company_linkedin_url),
        (select id from public.companies c where c.domain = s.company_domain::public.citext)
      ),
      data_json          = p.data_json || s.data_json,
      updated_at         = now()
    from _stage_people s
    where p.dedup_key = s.dedup_key
      and s.linkedin_url is null
      and s.dedup_key is not null
    returning p.id
  )
  select count(*)::int into v_dk_updated from updated;

  with new_rows as (
    insert into public.people
      (linkedin_hash_id, public_identifier, first_name, last_name, full_name,
       headline, about, location, country, photo_url, current_title,
       current_company_id, dedup_key, data_json)
    select
      s.linkedin_hash_id,
      s.public_identifier,
      s.first_name,
      s.last_name,
      coalesce(s.full_name, trim(concat_ws(' ', s.first_name, s.last_name))),
      s.headline,
      s.about,
      s.location,
      s.country,
      s.photo_url,
      s.current_title,
      coalesce(
        (select id from public.companies c where c.linkedin_url = s.company_linkedin_url),
        (select id from public.companies c where c.domain = s.company_domain::public.citext)
      ),
      s.dedup_key,
      s.data_json
    from _stage_people s
    where s.linkedin_url is null
      and s.dedup_key is not null
      and not exists (select 1 from public.people p where p.dedup_key = s.dedup_key)
    returning id, current_company_id
  )
  select
    count(*)::int,
    count(*) filter (where current_company_id is not null)::int
  into v_dk_inserted, v_linked
  from new_rows;

  return query select
    v_inserted + v_dk_inserted,
    v_matched + v_dk_updated,
    v_linked;
end $$;

grant execute on function public.bulk_upsert_people(jsonb) to authenticated;

-- -------------------------------------------------------------------
-- Extend link_audience_members to also match by dedup_key. This means
-- even if an existing row is missing linkedin_hash_id (legacy data from
-- before the v2 fix), we can still link it to an audience as long as
-- the current CSV row produces the same dedup_key.

create or replace function public.link_audience_members(
  p_audience_id  uuid,
  p_linkedin_urls text[] default '{}',
  p_hash_ids      text[] default '{}',
  p_dedup_keys    text[] default '{}'
) returns int
language plpgsql security definer set search_path = '' as $$
declare v_linked int := 0;
begin
  if not exists (
    select 1 from public.audiences a
    where a.id = p_audience_id
      and a.org_id in (select private.current_org_ids())
  ) then
    raise exception 'forbidden';
  end if;

  with matched as (
    select distinct p.id as person_id
    from public.people p
    where
      (p.linkedin_url     = any(coalesce(p_linkedin_urls, '{}'::text[])))
      or
      (p.linkedin_hash_id = any(coalesce(p_hash_ids,      '{}'::text[])))
      or
      (p.dedup_key        = any(coalesce(p_dedup_keys,    '{}'::text[])))
  ),
  ins as (
    insert into public.audience_members (audience_id, person_id)
    select p_audience_id, m.person_id from matched m
    on conflict (audience_id, person_id) do nothing
    returning 1
  )
  select count(*)::int into v_linked from ins;

  return v_linked;
end $$;

grant execute on function public.link_audience_members(uuid, text[], text[], text[]) to authenticated;
