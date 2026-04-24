-- ==========================================================
-- Sprint 3 migrations 8-12 — paste this whole file into SQL Editor
-- Safe to re-run: every function uses CREATE OR REPLACE.
-- ==========================================================

-- ===== 00000000000008_jobs_observability.sql =====
-- Sprint 3.1 — observability for the worker queue.
--
-- Two things:
--   1) Fix replay_dlq: the original used pgmq.read('dlq',30,1) WHERE msg_id=...
--      but pgmq.read returns the next visible message regardless of any WHERE
--      filter, so the fetch was effectively unfiltered. Read directly from the
--      queue table instead.
--   2) Add list_dlq() so the /jobs page can show pending DLQ messages without
--      consuming visibility timeout (a true peek).

create or replace function public.replay_dlq(p_msg_id bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_msg jsonb; v_new_id bigint;
begin
  select message into v_msg from pgmq.q_dlq where msg_id = p_msg_id;
  if v_msg is null then raise exception 'msg not found in dlq: %', p_msg_id; end if;
  select pgmq.send('jobs', v_msg) into v_new_id;
  perform pgmq.archive('dlq', p_msg_id);
  return v_new_id;
end $$;

grant execute on function public.replay_dlq(bigint) to authenticated;

create or replace function public.list_dlq(p_limit int default 100)
returns table(msg_id bigint, enqueued_at timestamptz, read_ct int, message jsonb)
language sql security definer set search_path='' as $$
  select msg_id, enqueued_at, read_ct, message
  from pgmq.q_dlq
  order by msg_id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

grant execute on function public.list_dlq(int) to authenticated;


-- ===== 00000000000009_apify_finalize.sql =====
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


-- ===== 00000000000010_email_finalize.sql =====
-- Sprint 3.3 — admin-mode finalizers for the email-finder waterfall.
-- All gated to service_role only (called from worker / webhooks-signalhire).

-- record_email: upsert into public.emails, return email row id.
-- Used by every email-finder handler so the dedup logic lives in one place.
create or replace function public.record_email(
  p_person_id uuid,
  p_email     public.citext,
  p_source    text,
  p_tier      int default 1,
  p_status    text default 'unverified'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.emails (person_id, email, source, tier, verification_status, is_primary)
  values (
    p_person_id,
    p_email,
    p_source,
    coalesce(p_tier, 1),
    coalesce(p_status, 'unverified'),
    not exists (select 1 from public.emails e where e.person_id = p_person_id)
  )
  on conflict (person_id, email) do update set
    source = coalesce(public.emails.source, excluded.source),
    tier   = least(public.emails.tier, excluded.tier),
    verification_status = case
      when public.emails.verification_status = 'unverified' then excluded.verification_status
      else public.emails.verification_status
    end
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_email(uuid,public.citext,text,int,text) from anon, authenticated;

-- ---------------------------------------------------------------------

create or replace function public.findymail_finalize(
  p_enrichment_id bigint,
  p_email         public.citext,
  p_run_cost_usd  numeric default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_enr public.enrichments%rowtype;
  v_email_id uuid;
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  if p_email is not null and v_enr.person_id is not null then
    select public.record_email(v_enr.person_id, p_email, 'findymail', 1, 'unverified')
      into v_email_id;
  end if;

  update public.enrichments set
    outcome        = case when p_email is not null then 'hit' else 'miss' end,
    email_returned = p_email,
    usd_cost       = coalesce(p_run_cost_usd, 0)
  where id = p_enrichment_id;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, provider, usd_cost, ref_id)
    values (v_enr.org_id, 'findymail', p_run_cost_usd, p_enrichment_id::text);
  end if;

  return v_email_id;
end $$;
revoke all on function public.findymail_finalize(bigint,public.citext,numeric) from anon, authenticated;

-- ---------------------------------------------------------------------

create or replace function public.signalhire_finalize_item(
  p_enrichment_id bigint,
  p_status        text,
  p_emails        jsonb,
  p_run_cost_usd  numeric default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_enr public.enrichments%rowtype;
  v_email_id uuid;
  v_first_email public.citext;
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  -- Take the first non-empty email value.
  select (e->>'value')::public.citext into v_first_email
  from jsonb_array_elements(coalesce(p_emails, '[]'::jsonb)) as e
  where coalesce(e->>'value','') <> ''
  limit 1;

  if v_first_email is not null and v_enr.person_id is not null then
    select public.record_email(v_enr.person_id, v_first_email, 'signalhire', 2, 'unverified')
      into v_email_id;
  end if;

  update public.enrichments set
    outcome        = case
                       when p_status = 'success' and v_first_email is not null then 'hit'
                       when p_status in ('credits_are_over','timeout_exceeded') then 'error'
                       else 'miss'
                     end,
    email_returned = v_first_email,
    usd_cost       = coalesce(p_run_cost_usd, 0),
    error_code     = case when p_status <> 'success' then p_status end
  where id = p_enrichment_id;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, provider, usd_cost, ref_id)
    values (v_enr.org_id, 'signalhire', p_run_cost_usd, p_enrichment_id::text);
  end if;

  return v_email_id;
end $$;
revoke all on function public.signalhire_finalize_item(bigint,text,jsonb,numeric) from anon, authenticated;

-- ---------------------------------------------------------------------

create or replace function public.instantly_verify_finalize(
  p_enrichment_id bigint,
  p_email_id      uuid,
  p_status        text,
  p_run_cost_usd  numeric default 0
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_enr public.enrichments%rowtype;
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  update public.emails
    set verification_status = case
          when p_status in ('valid','invalid','risky','accept_all','unknown') then p_status
          else 'unknown'
        end,
        verified_at = now(),
        verifier = 'instantly'
    where id = p_email_id;

  update public.enrichments set
    outcome             = case when p_status = 'valid' then 'hit' else 'miss' end,
    verification_status = p_status,
    usd_cost            = coalesce(p_run_cost_usd, 0)
  where id = p_enrichment_id;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, provider, usd_cost, ref_id)
    values (v_enr.org_id, 'instantly', p_run_cost_usd, p_enrichment_id::text);
  end if;
end $$;
revoke all on function public.instantly_verify_finalize(bigint,uuid,text,numeric) from anon, authenticated;


-- ===== 00000000000011_llm_finalize.sql =====
-- Sprint 3.4 — admin-mode finalizers for LLM scoring + message generation.
-- All gated to service_role only (called from worker).

create or replace function public.score_lead_finalize(
  p_pic_id            uuid,
  p_score             int,
  p_tier              text,
  p_reasons           text[],
  p_prompt_version_id uuid,
  p_run_cost_usd      numeric default 0
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_pic public.people_in_campaign%rowtype; v_org uuid;
begin
  select * into v_pic from public.people_in_campaign where id = p_pic_id;
  if not found then raise exception 'people_in_campaign % not found', p_pic_id; end if;

  select c.org_id into v_org
  from public.campaigns c
  where c.id = v_pic.campaign_id;

  update public.people_in_campaign set
    relevance_score   = p_score,
    relevance_tier    = p_tier,
    relevance_reasons = p_reasons,
    prompt_version_id = coalesce(p_prompt_version_id, prompt_version_id)
  where id = p_pic_id;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, client_id, campaign_id, provider, usd_cost, ref_id)
    values (v_org, v_pic.client_id, v_pic.campaign_id, 'llm:scoring', p_run_cost_usd, p_pic_id::text);
  end if;
end $$;
revoke all on function public.score_lead_finalize(uuid,int,text,text[],uuid,numeric) from anon, authenticated;

-- ---------------------------------------------------------------------

create or replace function public.generate_messages_finalize(
  p_pic_id            uuid,
  p_subject           text,
  p_bodies            jsonb,           -- [{step, body}, ...] length 4
  p_personalization   text,
  p_prompt_version_id uuid,
  p_run_cost_usd      numeric default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pic public.people_in_campaign%rowtype;
  v_org uuid;
  v_msg_id uuid;
  v_b1 text; v_b2 text; v_b3 text; v_b4 text;
begin
  select * into v_pic from public.people_in_campaign where id = p_pic_id;
  if not found then raise exception 'people_in_campaign % not found', p_pic_id; end if;

  select c.org_id into v_org from public.campaigns c where c.id = v_pic.campaign_id;

  -- Extract bodies by step (defensive against ordering).
  select b->>'body' into v_b1 from jsonb_array_elements(p_bodies) b where (b->>'step')::int = 1;
  select b->>'body' into v_b2 from jsonb_array_elements(p_bodies) b where (b->>'step')::int = 2;
  select b->>'body' into v_b3 from jsonb_array_elements(p_bodies) b where (b->>'step')::int = 3;
  select b->>'body' into v_b4 from jsonb_array_elements(p_bodies) b where (b->>'step')::int = 4;

  -- Live copy on PIC.
  update public.people_in_campaign set
    generated_subject = p_subject,
    generated_bodies  = p_bodies,
    prompt_version_id = coalesce(p_prompt_version_id, prompt_version_id)
  where id = p_pic_id;

  -- Audit copy in message_sequences (one per (person, campaign)).
  insert into public.message_sequences (
    person_id, campaign_id, prompt_version_id,
    subject, email_copy_1, email_copy_2, email_copy_3, email_copy_4,
    personalization
  ) values (
    v_pic.person_id, v_pic.campaign_id, p_prompt_version_id,
    p_subject, v_b1, v_b2, v_b3, v_b4, p_personalization
  )
  on conflict (person_id, campaign_id) do update set
    prompt_version_id = excluded.prompt_version_id,
    subject           = excluded.subject,
    email_copy_1      = excluded.email_copy_1,
    email_copy_2      = excluded.email_copy_2,
    email_copy_3      = excluded.email_copy_3,
    email_copy_4      = excluded.email_copy_4,
    personalization   = excluded.personalization
  returning id into v_msg_id;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, client_id, campaign_id, provider, usd_cost, ref_id)
    values (v_org, v_pic.client_id, v_pic.campaign_id, 'llm:messages', p_run_cost_usd, p_pic_id::text);
  end if;

  return v_msg_id;
end $$;
revoke all on function public.generate_messages_finalize(uuid,text,jsonb,text,uuid,numeric) from anon, authenticated;

-- ---------------------------------------------------------------------

-- Convenience: load the LLM input bundle for a single PIC. Returns one row
-- with everything the handler needs to render a prompt — saves 4 round-trips.
create or replace function public.llm_input_for_pic(p_pic_id uuid)
returns table(
  pic_id            uuid,
  org_id            uuid,
  client_id         uuid,
  campaign_id       uuid,
  person_id         uuid,
  full_name         text,
  current_title     text,
  headline          text,
  about             text,
  location          text,
  posts             jsonb,
  company_name      text,
  company_industry  text,
  company_description text,
  icp_description   text,
  brand_voice       text
)
language sql security definer set search_path = '' as $$
  select
    pic.id                 as pic_id,
    cl.org_id              as org_id,
    pic.client_id          as client_id,
    pic.campaign_id        as campaign_id,
    pic.person_id          as person_id,
    p.full_name,
    p.current_title,
    p.headline,
    p.about,
    p.location,
    p.posts,
    co.name                as company_name,
    co.industry            as company_industry,
    co.description         as company_description,
    cl.icp_description,
    cl.brand_voice
  from public.people_in_campaign pic
  join public.people p   on p.id = pic.person_id
  left join public.companies co on co.id = p.current_company_id
  join public.clients cl on cl.id = pic.client_id
  where pic.id = p_pic_id;
$$;
revoke all on function public.llm_input_for_pic(uuid) from anon, authenticated;


-- ===== 00000000000012_perplexity_finalize.sql =====
-- Sprint 3.5 — admin-mode finalizer for Perplexity custom research.
-- Stores the research result + citations in:
--   enrichments.response_payload (audit log)
--   people.data_json -> 'perplexity' (so downstream prompts can reference it)

create or replace function public.perplexity_finalize(
  p_enrichment_id bigint,
  p_content       text,
  p_citations     jsonb,
  p_run_cost_usd  numeric default 0
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_enr public.enrichments%rowtype;
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  update public.enrichments set
    response_payload = jsonb_build_object('content', p_content, 'citations', p_citations),
    outcome          = case when p_content is not null and length(p_content) > 0 then 'hit' else 'miss' end,
    usd_cost         = coalesce(p_run_cost_usd, 0)
  where id = p_enrichment_id;

  if v_enr.person_id is not null and p_content is not null then
    update public.people
       set data_json = data_json || jsonb_build_object(
             'perplexity', jsonb_build_object(
               'content', p_content,
               'citations', p_citations,
               'fetched_at', now()
             )
           ),
           updated_at = now()
     where id = v_enr.person_id;
  end if;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, provider, usd_cost, ref_id)
    values (v_enr.org_id, 'perplexity', p_run_cost_usd, p_enrichment_id::text);
  end if;
end $$;
revoke all on function public.perplexity_finalize(bigint,text,jsonb,numeric) from anon, authenticated;

