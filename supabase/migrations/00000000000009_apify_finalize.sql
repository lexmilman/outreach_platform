-- Sprint 3.2 — admin-mode finalizers used by webhooks-apify (service-role only).
--
-- The existing bulk_upsert_{people,companies} RPCs gate on auth.uid(); Edge
-- Functions run as service_role with no JWT, so we expose narrower helpers
-- here. Each takes a single dataset item and the enrichment row id, then:
--   1) merges the new data into people/companies (coalesce + jsonb concat)
--   2) updates the enrichments row with cost + outcome + response payload
--   3) writes a cost_tracking entry
--
-- Grant only to service_role so they cannot be called from the browser.

create or replace function public.apify_finalize_person(
  p_enrichment_id bigint,
  p_item jsonb,
  p_run_cost_usd numeric default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_enr   public.enrichments%rowtype;
  v_person uuid;
  v_company uuid;
  v_li_url text := nullif(p_item->>'linkedinUrl','');
  v_company_li text := nullif(p_item->>'companyLinkedinUrl','');
  v_company_name text := nullif(p_item->>'companyName','');
  v_company_website text := nullif(p_item->>'companyWebsite','');
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  -- Upsert (or create) the company first if we have a linkedin URL or name.
  if v_company_li is not null then
    insert into public.companies (linkedin_url, name, website)
    values (v_company_li, v_company_name, v_company_website)
    on conflict (linkedin_url) do update set
      name    = coalesce(public.companies.name,    excluded.name),
      website = coalesce(public.companies.website, excluded.website),
      updated_at = now()
    returning id into v_company;
  end if;

  -- Upsert the person.
  if v_li_url is not null then
    insert into public.people (
      linkedin_url, public_identifier, first_name, last_name, full_name,
      headline, about, location, country, photo_url,
      current_title, current_company_id,
      connections_count, followers_count,
      data_json
    ) values (
      v_li_url,
      nullif(p_item->>'publicIdentifier',''),
      nullif(p_item->>'firstName',''),
      nullif(p_item->>'lastName',''),
      nullif(p_item->>'fullName',''),
      nullif(p_item->>'headline',''),
      nullif(p_item->>'about',''),
      nullif(p_item->>'location',''),
      nullif(p_item->>'country',''),
      nullif(p_item->>'photoUrl',''),
      nullif(p_item->>'currentPosition',''),
      v_company,
      (p_item->>'connectionsCount')::int,
      (p_item->>'followersCount')::int,
      jsonb_build_object('apify', p_item)
    )
    on conflict (linkedin_url) do update set
      first_name        = coalesce(public.people.first_name,        excluded.first_name),
      last_name         = coalesce(public.people.last_name,         excluded.last_name),
      full_name         = coalesce(public.people.full_name,         excluded.full_name),
      headline          = coalesce(public.people.headline,          excluded.headline),
      about             = coalesce(public.people.about,             excluded.about),
      location          = coalesce(public.people.location,          excluded.location),
      country           = coalesce(public.people.country,           excluded.country),
      photo_url         = coalesce(public.people.photo_url,         excluded.photo_url),
      current_title     = coalesce(public.people.current_title,     excluded.current_title),
      current_company_id= coalesce(public.people.current_company_id, excluded.current_company_id),
      connections_count = coalesce(public.people.connections_count, excluded.connections_count),
      followers_count   = coalesce(public.people.followers_count,   excluded.followers_count),
      data_json         = public.people.data_json || excluded.data_json,
      updated_at        = now()
    returning id into v_person;
  end if;

  -- Finalize enrichment row.
  update public.enrichments set
    response_payload = p_item,
    outcome          = case when v_person is not null then 'hit' else 'miss' end,
    usd_cost         = coalesce(p_run_cost_usd, 0),
    person_id        = coalesce(v_person, public.enrichments.person_id),
    company_id       = coalesce(v_company, public.enrichments.company_id)
  where id = p_enrichment_id;

  -- Roll up cost.
  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, provider, usd_cost, ref_id)
    values (v_enr.org_id, 'apify', p_run_cost_usd, v_enr.provider_request_id);
  end if;

  return v_person;
end $$;

revoke all on function public.apify_finalize_person(bigint,jsonb,numeric) from anon, authenticated;

-- ---------------------------------------------------------------------

create or replace function public.apify_finalize_company(
  p_enrichment_id bigint,
  p_item jsonb,
  p_run_cost_usd numeric default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_enr public.enrichments%rowtype;
  v_company uuid;
  v_li_url text := nullif(p_item->>'linkedinUrl','');
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  if v_li_url is not null then
    insert into public.companies (
      linkedin_url, name, tagline, description, industry, employee_count,
      employee_range, founded_year, website, hq_city, hq_country, hq_region,
      logo_url, cover_url, specialities, data_json
    ) values (
      v_li_url,
      nullif(p_item->>'name',''),
      nullif(p_item->>'tagline',''),
      nullif(p_item->>'description',''),
      nullif(p_item->>'industry',''),
      (p_item->>'employeeCount')::int,
      nullif(p_item->>'employeeRange',''),
      (p_item->>'foundedYear')::int,
      nullif(p_item->>'website',''),
      nullif(p_item->>'hqCity',''),
      nullif(p_item->>'hqCountry',''),
      nullif(p_item->>'hqRegion',''),
      nullif(p_item->>'logoUrl',''),
      nullif(p_item->>'coverUrl',''),
      array(select jsonb_array_elements_text(coalesce(p_item->'specialities','[]'::jsonb))),
      jsonb_build_object('apify', p_item)
    )
    on conflict (linkedin_url) do update set
      name           = coalesce(public.companies.name,           excluded.name),
      tagline        = coalesce(public.companies.tagline,        excluded.tagline),
      description    = coalesce(public.companies.description,    excluded.description),
      industry       = coalesce(public.companies.industry,       excluded.industry),
      employee_count = coalesce(public.companies.employee_count, excluded.employee_count),
      employee_range = coalesce(public.companies.employee_range, excluded.employee_range),
      founded_year   = coalesce(public.companies.founded_year,   excluded.founded_year),
      website        = coalesce(public.companies.website,        excluded.website),
      hq_city        = coalesce(public.companies.hq_city,        excluded.hq_city),
      hq_country     = coalesce(public.companies.hq_country,     excluded.hq_country),
      hq_region      = coalesce(public.companies.hq_region,      excluded.hq_region),
      logo_url       = coalesce(public.companies.logo_url,       excluded.logo_url),
      cover_url      = coalesce(public.companies.cover_url,      excluded.cover_url),
      specialities   = coalesce(public.companies.specialities,   excluded.specialities),
      data_json      = public.companies.data_json || excluded.data_json,
      updated_at     = now()
    returning id into v_company;
  end if;

  update public.enrichments set
    response_payload = p_item,
    outcome          = case when v_company is not null then 'hit' else 'miss' end,
    usd_cost         = coalesce(p_run_cost_usd, 0),
    company_id       = coalesce(v_company, public.enrichments.company_id)
  where id = p_enrichment_id;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, provider, usd_cost, ref_id)
    values (v_enr.org_id, 'apify', p_run_cost_usd, v_enr.provider_request_id);
  end if;

  return v_company;
end $$;

revoke all on function public.apify_finalize_company(bigint,jsonb,numeric) from anon, authenticated;

-- ---------------------------------------------------------------------

create or replace function public.apify_finalize_posts(
  p_enrichment_id bigint,
  p_items jsonb,
  p_run_cost_usd numeric default 0
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_enr public.enrichments%rowtype;
  v_count int := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  if v_enr.person_id is not null and v_count > 0 then
    update public.people
       set posts = p_items,
           updated_at = now()
     where id = v_enr.person_id;
  end if;

  update public.enrichments set
    response_payload = p_items,
    outcome          = case when v_count > 0 then 'hit' else 'miss' end,
    usd_cost         = coalesce(p_run_cost_usd, 0)
  where id = p_enrichment_id;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, provider, usd_cost, units, unit_type, ref_id)
    values (v_enr.org_id, 'apify', p_run_cost_usd, v_count, 'posts', v_enr.provider_request_id);
  end if;

  return v_count;
end $$;

revoke all on function public.apify_finalize_posts(bigint,jsonb,numeric) from anon, authenticated;

-- ---------------------------------------------------------------------
-- pgmq wrappers exposed to PostgREST (public schema). Only service_role
-- may call them — used by Edge Functions (worker, webhooks).

create or replace function public.pgmq_send(queue_name text, msg jsonb, delay_seconds int default 0)
returns bigint
language sql security definer set search_path = '' as $$
  select pgmq.send(queue_name, msg, delay_seconds);
$$;
revoke all on function public.pgmq_send(text,jsonb,int) from anon, authenticated;

create or replace function public.pgmq_read(queue_name text, vt int, qty int)
returns setof pgmq.message_record
language sql security definer set search_path = '' as $$
  select * from pgmq.read(queue_name, vt, qty);
$$;
revoke all on function public.pgmq_read(text,int,int) from anon, authenticated;

create or replace function public.pgmq_delete(queue_name text, msg_id bigint)
returns boolean
language sql security definer set search_path = '' as $$
  select pgmq.delete(queue_name, msg_id);
$$;
revoke all on function public.pgmq_delete(text,bigint) from anon, authenticated;

create or replace function public.pgmq_archive(queue_name text, msg_id bigint)
returns boolean
language sql security definer set search_path = '' as $$
  select pgmq.archive(queue_name, msg_id);
$$;
revoke all on function public.pgmq_archive(text,bigint) from anon, authenticated;
