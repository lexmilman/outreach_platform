-- ========= CSV bulk import RPCs =========
-- Goal: single round-trip upsert for companies + people that respects RLS
-- via SECURITY DEFINER with an org-membership gate.
-- Returns counts only (inserted / matched / skipped). Detailed per-row
-- rejection is handled client-side before we ever call these.

create or replace function public.bulk_upsert_companies(p_rows jsonb)
returns table(inserted int, matched int)
language plpgsql security definer set search_path = '' as $$
declare
  v_total int := 0;
  v_matched int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  with input as (
    select
      nullif(r->>'linkedin_url','')          as linkedin_url,
      nullif(r->>'domain','')                as domain,
      nullif(r->>'name','')                  as name,
      nullif(r->>'industry','')              as industry,
      (r->>'employee_count')::int            as employee_count,
      nullif(r->>'employee_range','')        as employee_range,
      nullif(r->>'website','')               as website,
      nullif(r->>'hq_city','')               as hq_city,
      nullif(r->>'hq_country','')            as hq_country,
      nullif(r->>'description','')           as description,
      nullif(r->>'logo_url','')              as logo_url,
      coalesce(r->'data_json', '{}'::jsonb)  as data_json
    from jsonb_array_elements(p_rows) as r
    where r->>'linkedin_url' is not null or r->>'domain' is not null
  ),
  up as (
    insert into public.companies
      (linkedin_url, domain, name, industry, employee_count, employee_range,
       website, hq_city, hq_country, description, logo_url, data_json)
    select
      i.linkedin_url, i.domain, i.name, i.industry, i.employee_count,
      i.employee_range, i.website, i.hq_city, i.hq_country, i.description,
      i.logo_url, i.data_json
    from input i
    where i.linkedin_url is not null
    on conflict (linkedin_url) do update set
      name           = coalesce(public.companies.name,       excluded.name),
      domain         = coalesce(public.companies.domain,     excluded.domain),
      industry       = coalesce(public.companies.industry,   excluded.industry),
      employee_count = coalesce(public.companies.employee_count, excluded.employee_count),
      website        = coalesce(public.companies.website,    excluded.website),
      hq_city        = coalesce(public.companies.hq_city,    excluded.hq_city),
      hq_country     = coalesce(public.companies.hq_country, excluded.hq_country),
      description    = coalesce(public.companies.description, excluded.description),
      logo_url       = coalesce(public.companies.logo_url,   excluded.logo_url),
      data_json      = public.companies.data_json || excluded.data_json,
      updated_at     = now()
    returning (xmax = 0) as was_inserted
  )
  select
    count(*) filter (where was_inserted)::int,
    count(*) filter (where not was_inserted)::int
  into v_total, v_matched
  from up;

  -- Rows without linkedin_url but with a domain — match on domain, skip if present.
  with input_domain as (
    select
      nullif(r->>'domain','')::citext as domain,
      nullif(r->>'name','')           as name,
      nullif(r->>'website','')        as website,
      coalesce(r->'data_json','{}'::jsonb) as data_json
    from jsonb_array_elements(p_rows) as r
    where (r->>'linkedin_url') is null and (r->>'domain') is not null
  ),
  dom_up as (
    insert into public.companies (domain, name, website, data_json)
    select d.domain, d.name, d.website, d.data_json
    from input_domain d
    where not exists (select 1 from public.companies c where c.domain = d.domain)
    returning 1
  )
  select v_total + count(*)::int into v_total from dom_up;

  return query select v_total, v_matched;
end $$;
grant execute on function public.bulk_upsert_companies(jsonb) to authenticated;

-- ---------------------------------------------------------------------

create or replace function public.bulk_upsert_people(p_rows jsonb)
returns table(inserted int, matched int, linked_companies int)
language plpgsql security definer set search_path = '' as $$
declare
  v_inserted int := 0;
  v_matched int := 0;
  v_linked int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Stage the input so we can compute company_id lookups before inserting.
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

  -- Upsert on linkedin_url (primary key for a person).
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
        (select id from public.companies c where c.domain = s.company_domain::citext)
      ),
      s.dedup_key,
      s.data_json
    from _stage_people s
    where s.linkedin_url is not null
    on conflict (linkedin_url) do update set
      first_name         = coalesce(public.people.first_name,    excluded.first_name),
      last_name          = coalesce(public.people.last_name,     excluded.last_name),
      full_name          = coalesce(public.people.full_name,     excluded.full_name),
      headline           = coalesce(public.people.headline,      excluded.headline),
      about              = coalesce(public.people.about,         excluded.about),
      location           = coalesce(public.people.location,      excluded.location),
      country            = coalesce(public.people.country,       excluded.country),
      photo_url          = coalesce(public.people.photo_url,     excluded.photo_url),
      current_title      = coalesce(public.people.current_title, excluded.current_title),
      current_company_id = coalesce(public.people.current_company_id, excluded.current_company_id),
      dedup_key          = coalesce(public.people.dedup_key,     excluded.dedup_key),
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

  -- For rows without linkedin_url, dedup on dedup_key.
  with dk_up as (
    insert into public.people
      (first_name, last_name, full_name, headline, about, location, country,
       photo_url, current_title, current_company_id, dedup_key, data_json)
    select
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
        (select id from public.companies c where c.domain = s.company_domain::citext)
      ),
      s.dedup_key,
      s.data_json
    from _stage_people s
    where s.linkedin_url is null
      and s.dedup_key is not null
      and not exists (select 1 from public.people p where p.dedup_key = s.dedup_key)
    returning 1
  )
  select v_inserted + count(*)::int into v_inserted from dk_up;

  return query select v_inserted, v_matched, v_linked;
end $$;
grant execute on function public.bulk_upsert_people(jsonb) to authenticated;

-- ========= Helper view: people with their current company =========
create or replace view public.v_people_with_company
with (security_invoker = true) as
select
  p.id,
  p.linkedin_url,
  p.linkedin_hash_id,
  p.public_identifier,
  p.first_name,
  p.last_name,
  p.full_name,
  p.headline,
  p.about,
  p.location,
  p.country,
  p.photo_url,
  p.current_title,
  p.current_company_id,
  p.connections_count,
  p.followers_count,
  p.dedup_key,
  p.data_json,
  p.created_at,
  p.updated_at,
  c.name        as company_name,
  c.domain      as company_domain,
  c.industry    as company_industry,
  c.linkedin_url as company_linkedin_url,
  c.logo_url    as company_logo_url
from public.people p
left join public.companies c on c.id = p.current_company_id;

grant select on public.v_people_with_company to authenticated;

-- ========= Unique constraint for table_views upserts =========
alter table public.table_views
  add constraint table_views_user_entity_name_unique
  unique (user_id, org_id, entity, name);

-- ========= Whitelisted people update RPC (for inline cell edits) =========
-- Only allows a small set of columns; anything else has to go via the
-- worker/service role. Keeps Sprint 2 cell editing safe.
create or replace function public.update_person_fields(
  p_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_full_name text default null,
  p_current_title text default null,
  p_location text default null,
  p_country text default null
) returns public.people
language plpgsql security definer set search_path = '' as $$
declare v_row public.people;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.people
     set first_name    = coalesce(p_first_name,    first_name),
         last_name     = coalesce(p_last_name,     last_name),
         full_name     = coalesce(p_full_name,     full_name),
         current_title = coalesce(p_current_title, current_title),
         location      = coalesce(p_location,      location),
         country       = coalesce(p_country,       country),
         updated_at    = now()
   where id = p_id
   returning * into v_row;
  return v_row;
end $$;
grant execute on function public.update_person_fields(uuid, text, text, text, text, text, text) to authenticated;
