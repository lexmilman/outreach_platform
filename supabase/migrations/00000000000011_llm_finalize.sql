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
