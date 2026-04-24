-- Sprint 3.3 — admin-mode finalizers for the email-finder waterfall.
-- All gated to service_role only (called from worker / webhooks-signalhire).

-- record_email: upsert into public.emails, return email row id.
-- Used by every email-finder handler so the dedup logic lives in one place.
create or replace function public.record_email(
  p_person_id uuid,
  p_email     citext,
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
revoke all on function public.record_email(uuid,citext,text,int,text) from anon, authenticated;

-- ---------------------------------------------------------------------

create or replace function public.findymail_finalize(
  p_enrichment_id bigint,
  p_email         citext,
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
revoke all on function public.findymail_finalize(bigint,citext,numeric) from anon, authenticated;

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
  v_first_email citext;
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  -- Take the first non-empty email value.
  select (e->>'value')::citext into v_first_email
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
