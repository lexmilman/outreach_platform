-- Sprint 4 — Instantly push + analytics.
--   1. `sequence_templates` — reusable per-client email sequences (subject + 4 bodies + delays).
--   2. Extends `campaigns.status` with 'ready' (Instantly campaign created, leads not yet pushed).
--   3. `list_pushable_leads` RPC — lookups leads ready to push into Instantly.
--   4. `v_campaign_kpis` view — per-campaign rollup of analytics + cost.
--   5. `analytics_summary` RPC — compact dashboard payload for `/analytics`.
--   6. Seed a couple of stock templates via `bootstrap_sequence_templates`.

-- Extend the campaigns status enum with 'ready'.
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('draft','ready','running','paused','completed','archived'));

create table if not exists public.sequence_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  name        text not null,
  description text,
  steps       jsonb not null default '[]'::jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists sequence_templates_org_idx    on public.sequence_templates(org_id);
create index if not exists sequence_templates_client_idx on public.sequence_templates(client_id);

alter table public.sequence_templates enable row level security;

drop policy if exists sequence_templates_rw on public.sequence_templates;
create policy sequence_templates_rw on public.sequence_templates
  for all to authenticated
  using (org_id in (select private.current_org_ids()))
  with check (org_id in (select private.current_org_ids()));

create trigger tg_sequence_templates_updated
  before update on public.sequence_templates
  for each row execute function public.tg_set_updated_at();

-- --------------------------------------------------------------------
-- RPC: list_pushable_leads
-- Returns leads that (a) belong to the campaign, (b) are in a sendable status,
-- (c) have a verified email on file, and (d) have generated messages.
-- Caller must own the campaign via org membership.

create or replace function public.list_pushable_leads(
  p_campaign_id uuid,
  p_limit       int default 100
) returns table (
  person_in_campaign_id uuid,
  person_id             uuid,
  email                 citext,
  first_name            text,
  last_name             text,
  company_name          text,
  subject               text,
  email_copy_1          text,
  email_copy_2          text,
  email_copy_3          text,
  email_copy_4          text,
  personalization       text,
  waterfall_lead_id     uuid,
  tier                  int,
  linkedin_url          text,
  current_title         text,
  location              text
) language sql stable security definer set search_path = '' as $$
  select
    pic.id            as person_in_campaign_id,
    p.id              as person_id,
    e.email           as email,
    p.first_name,
    p.last_name,
    c_company.name    as company_name,
    ms.subject,
    ms.email_copy_1,
    ms.email_copy_2,
    ms.email_copy_3,
    ms.email_copy_4,
    ms.personalization,
    pic.waterfall_lead_id,
    camp.tier,
    p.linkedin_url,
    p.current_title,
    p.location
  from public.people_in_campaign pic
  join public.campaigns camp on camp.id = pic.campaign_id
  join public.people p on p.id = pic.person_id
  join public.message_sequences ms
    on ms.person_id = pic.person_id and ms.campaign_id = pic.campaign_id
  join public.emails e
    on e.id = pic.email_id
  left join public.companies c_company on c_company.id = p.current_company_id
  where pic.campaign_id = p_campaign_id
    and camp.org_id in (select private.current_org_ids())
    and pic.status in ('new','queued')
    and pic.instantly_lead_id is null
    and ms.pushed_to_instantly_at is null
    and e.verification_status in ('valid','accept_all')
    and (pic.relevance_score is null or pic.relevance_score >= 70)
  order by pic.relevance_score desc nulls last, pic.added_at asc
  limit greatest(1, least(p_limit, 1000));
$$;

grant execute on function public.list_pushable_leads(uuid, int) to authenticated;

-- --------------------------------------------------------------------
-- RPC: mark_leads_pushed — called by worker after Instantly accepts them.
-- Updates people_in_campaign + message_sequences in a single transaction.
-- SECURITY DEFINER so the admin client can run it without the org membership dance.

create or replace function public.mark_leads_pushed(
  p_campaign_id uuid,
  p_ids uuid[]
) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int := 0;
begin
  update public.people_in_campaign
    set status = 'queued',
        instantly_lead_id = coalesce(instantly_lead_id, id::text),
        last_event_at = now()
  where campaign_id = p_campaign_id
    and id = any(p_ids);
  get diagnostics v_n = row_count;

  update public.message_sequences ms
    set pushed_to_instantly_at = now()
  from public.people_in_campaign pic
  where pic.id = any(p_ids)
    and pic.campaign_id = p_campaign_id
    and ms.campaign_id = pic.campaign_id
    and ms.person_id   = pic.person_id
    and ms.pushed_to_instantly_at is null;

  return v_n;
end $$;

grant execute on function public.mark_leads_pushed(uuid, uuid[]) to service_role;

-- --------------------------------------------------------------------
-- View: v_campaign_kpis — per-campaign rollup from analytics_snapshots + cost_tracking.
-- security_invoker so RLS on campaigns still applies.

create or replace view public.v_campaign_kpis
with (security_invoker = true)
as
  select
    camp.id                                              as campaign_id,
    camp.org_id,
    camp.client_id,
    camp.name                                            as campaign_name,
    camp.status                                          as campaign_status,
    coalesce(a.sent, 0)                                  as sent,
    coalesce(a.opened, 0)                                as opened,
    coalesce(a.replied, 0)                               as replied,
    coalesce(a.positive_replied, 0)                      as positive_replied,
    coalesce(a.bounced, 0)                               as bounced,
    coalesce(a.unsubscribed, 0)                          as unsubscribed,
    coalesce(a.clicked, 0)                               as clicked,
    coalesce(a.total_meeting_booked, 0)                  as meetings,
    coalesce(c.usd_cost, 0)                              as usd_cost,
    case when coalesce(a.sent,0) > 0
         then round(100.0 * coalesce(a.opened,0)::numeric   / a.sent, 2)
         else 0 end                                      as open_rate_pct,
    case when coalesce(a.sent,0) > 0
         then round(100.0 * coalesce(a.replied,0)::numeric / a.sent, 2)
         else 0 end                                      as reply_rate_pct,
    case when coalesce(a.replied,0) > 0
         then round(100.0 * coalesce(a.positive_replied,0)::numeric / a.replied, 2)
         else 0 end                                      as positive_rate_pct,
    case when coalesce(a.replied,0) > 0
         then round(coalesce(c.usd_cost,0) / a.replied, 4)
         else null end                                   as usd_per_reply
  from public.campaigns camp
  left join lateral (
    select
      sum(sent) as sent, sum(opened) as opened, sum(replied) as replied,
      sum(positive_replied) as positive_replied,
      sum(bounced) as bounced, sum(unsubscribed) as unsubscribed,
      sum(clicked) as clicked, sum(total_meeting_booked) as total_meeting_booked
    from public.analytics_snapshots
    where campaign_id = camp.id
  ) a on true
  left join lateral (
    select sum(usd_cost) as usd_cost
    from public.cost_tracking
    where campaign_id = camp.id
  ) c on true;

-- --------------------------------------------------------------------
-- RPC: analytics_summary — one round-trip for the dashboard page.

create or replace function public.analytics_summary(
  p_client_id uuid default null,
  p_from date default (current_date - interval '30 days')::date,
  p_to date   default current_date
) returns table (
  total_sent int,
  total_opened int,
  total_replied int,
  total_positive int,
  total_meetings int,
  total_cost numeric,
  open_rate_pct numeric,
  reply_rate_pct numeric,
  positive_rate_pct numeric,
  usd_per_reply numeric,
  provider_costs jsonb,
  daily_series jsonb
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_org_ids uuid[];
begin
  v_org_ids := array(select private.current_org_ids());

  return query
  with camp_scope as (
    select id from public.campaigns
    where org_id = any(v_org_ids)
      and (p_client_id is null or client_id = p_client_id)
  ),
  agg as (
    select
      coalesce(sum(sent), 0)              as sent,
      coalesce(sum(opened), 0)            as opened,
      coalesce(sum(replied), 0)           as replied,
      coalesce(sum(positive_replied), 0)  as positive,
      coalesce(sum(total_meeting_booked), 0) as meetings
    from public.analytics_snapshots s
    where s.campaign_id in (select id from camp_scope)
      and s.day between p_from and p_to
  ),
  cost as (
    select coalesce(sum(usd_cost), 0) as total
    from public.cost_tracking
    where org_id = any(v_org_ids)
      and (p_client_id is null or client_id = p_client_id)
      and day between p_from and p_to
  ),
  provider_costs as (
    select jsonb_object_agg(provider, round(usd::numeric, 4)) as j
    from (
      select provider, sum(usd_cost) as usd
      from public.cost_tracking
      where org_id = any(v_org_ids)
        and (p_client_id is null or client_id = p_client_id)
        and day between p_from and p_to
      group by provider
    ) sub
  ),
  daily as (
    select jsonb_agg(payload order by day) as j
    from (
      select jsonb_build_object(
               'day', s.day,
               'sent', sum(sent),
               'replied', sum(replied),
               'positive', sum(positive_replied)
             ) as payload,
             s.day
      from public.analytics_snapshots s
      where s.campaign_id in (select id from camp_scope)
        and s.day between p_from and p_to
      group by s.day
    ) series
  )
  select
    agg.sent::int                     as total_sent,
    agg.opened::int                   as total_opened,
    agg.replied::int                  as total_replied,
    agg.positive::int                 as total_positive,
    agg.meetings::int                 as total_meetings,
    round(cost.total::numeric, 4)     as total_cost,
    case when agg.sent > 0 then round(100.0 * agg.opened::numeric / agg.sent, 2) else 0 end    as open_rate_pct,
    case when agg.sent > 0 then round(100.0 * agg.replied::numeric / agg.sent, 2) else 0 end   as reply_rate_pct,
    case when agg.replied > 0 then round(100.0 * agg.positive::numeric / agg.replied, 2) else 0 end as positive_rate_pct,
    case when agg.replied > 0 then round(cost.total::numeric / agg.replied, 4) else null end       as usd_per_reply,
    coalesce(provider_costs.j, '{}'::jsonb) as provider_costs,
    coalesce(daily.j, '[]'::jsonb)          as daily_series
  from agg, cost, provider_costs, daily;
end $$;

grant execute on function public.analytics_summary(uuid, date, date) to authenticated;

-- --------------------------------------------------------------------
-- Seed: two stock sequence templates, one per org, on first call.
-- Safe to re-run.

create or replace function public.bootstrap_sequence_templates()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_inserted int := 0;
begin
  for v_org in (select id from public.organizations where id in (select private.current_org_ids()))
  loop
    insert into public.sequence_templates (org_id, client_id, name, description, steps, is_default)
    select v_org, null,
           'Cold 4-step v1',
           'Plain 4-touch cadence. Day 0 / 3 / 7 / 14. Replaces body tokens with LLM-generated copies.',
           $j$[
             {"step": 1, "delay_days": 0,  "subject": "{{subject}}",              "body": "{{email_copy_1}}"},
             {"step": 2, "delay_days": 3,  "subject": "Re: {{subject}}",          "body": "{{email_copy_2}}"},
             {"step": 3, "delay_days": 7,  "subject": "Last thought — {{subject}}", "body": "{{email_copy_3}}"},
             {"step": 4, "delay_days": 14, "subject": "Wrapping up — {{subject}}",  "body": "{{email_copy_4}}"}
           ]$j$::jsonb,
           true
    where not exists (
      select 1 from public.sequence_templates
      where org_id = v_org and name = 'Cold 4-step v1'
    );
    get diagnostics v_inserted = row_count;
  end loop;
  return v_inserted;
end $$;

grant execute on function public.bootstrap_sequence_templates() to authenticated;
