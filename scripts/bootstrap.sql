-- =====================================================================
-- Leadflow bootstrap SQL — concatenated migrations 0–7 + Vault secrets.
-- Paste this whole file into the Supabase SQL Editor and click Run.
-- Safe to rerun: all DDL uses IF NOT EXISTS / OR REPLACE.
-- =====================================================================


-- ===== 00000000000000_extensions.sql =====
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists pgmq;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;


-- ===== 00000000000001_schema.sql =====
-- ========= Multi-tenant foundation (single-user today, ready later) =========
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz default now()
);

create table public.memberships (
  user_id  uuid references auth.users(id) on delete cascade,
  org_id   uuid references public.organizations(id) on delete cascade,
  role     text not null default 'owner' check (role in ('owner','admin','member')),
  primary key (user_id, org_id)
);

-- ========= Clients (agency customers) =========
create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  slug            text not null,
  icp_description text,
  brand_voice     text,
  is_archived     boolean not null default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (org_id, slug)
);
create index on public.clients(org_id);

-- ========= Global companies =========
create table public.companies (
  id                uuid primary key default gen_random_uuid(),
  linkedin_url      text unique,
  domain            citext,
  name              text,
  industry          text,
  employee_count    int,
  employee_range    text,
  founded_year      int,
  hq_country        text,
  hq_city           text,
  hq_region         text,
  description       text,
  tagline           text,
  logo_url          text,
  cover_url         text,
  website           text,
  specialities      text[],
  data_json         jsonb not null default '{}',
  search_doc        tsvector generated always as (
                      to_tsvector('simple',
                        coalesce(name,'') || ' ' ||
                        coalesce(description,'') || ' ' ||
                        coalesce(industry,'') || ' ' ||
                        coalesce(hq_city,'') || ' ' ||
                        coalesce(hq_country,''))
                    ) stored,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index companies_linkedin_idx on public.companies(linkedin_url);
create index companies_domain_idx   on public.companies(domain);
create index companies_data_gin     on public.companies using gin (data_json jsonb_path_ops);
create index companies_search_idx   on public.companies using gin (search_doc);
create index companies_trgm_name_idx on public.companies using gin (name gin_trgm_ops);

-- ========= Global people =========
create table public.people (
  id                uuid primary key default gen_random_uuid(),
  linkedin_url      text unique,
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
  current_company_id uuid references public.companies(id),
  current_title     text,
  years_in_position numeric,
  connections_count int,
  followers_count   int,
  skills            text[],
  languages         text[],
  education         jsonb default '[]',
  experience        jsonb default '[]',
  posts             jsonb default '[]',
  data_json         jsonb not null default '{}',
  dedup_key         text,
  search_doc        tsvector generated always as (
                      to_tsvector('simple',
                        coalesce(first_name,'') || ' ' ||
                        coalesce(last_name,'')  || ' ' ||
                        coalesce(headline,'')   || ' ' ||
                        coalesce(about,''))
                    ) stored,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index people_linkedin_idx on public.people(linkedin_url);
create index people_dedup_idx    on public.people(dedup_key);
create index people_company_idx  on public.people(current_company_id);
create index people_data_gin     on public.people using gin (data_json jsonb_path_ops);
create index people_search_idx   on public.people using gin (search_doc);
create index people_trgm_name_idx on public.people using gin (full_name gin_trgm_ops);

-- ========= Emails (per-person email list) =========
create table public.emails (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references public.people(id) on delete cascade,
  email             citext not null,
  source            text not null check (source in ('csv','findymail','signalhire','manual','linkedin')),
  verification_status text not null default 'unverified'
                    check (verification_status in
                      ('unverified','valid','invalid','risky','accept_all','pre_verified','unknown')),
  verified_at       timestamptz,
  verifier          text,
  last_used_at      timestamptz,
  is_primary        boolean not null default false,
  tier              int not null default 1,
  freshness_expires_at timestamptz,
  created_at        timestamptz default now(),
  unique (person_id, email)
);
create index emails_person_idx on public.emails(person_id);
create index emails_status_idx on public.emails(verification_status);

-- ========= Audiences =========
create table public.audiences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete set null,
  name        text not null,
  source      text not null default 'csv',
  row_count   int not null default 0,
  created_at  timestamptz default now()
);

-- ========= Campaigns =========
create table public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  audience_id       uuid references public.audiences(id) on delete set null,
  name              text not null,
  instantly_campaign_id text,
  tier              int not null default 1,
  parent_campaign_id uuid references public.campaigns(id),
  status            text not null default 'draft'
                    check (status in ('draft','running','paused','completed','archived')),
  config            jsonb not null default '{}',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index campaigns_client_idx on public.campaigns(client_id);

-- ========= Join: people <-> campaign (interaction history) =========
create table public.people_in_campaign (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null references public.people(id) on delete cascade,
  campaign_id         uuid not null references public.campaigns(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete cascade,
  audience_id         uuid references public.audiences(id) on delete set null,
  email_used          citext,
  email_id            uuid references public.emails(id) on delete set null,
  instantly_lead_id   text,
  waterfall_lead_id   uuid default gen_random_uuid(),
  status              text not null default 'new'
                      check (status in ('new','queued','sent','opened','clicked','replied',
                        'positive_reply','bounced','unsubscribed','completed','escalated')),
  relevance_score     int check (relevance_score between 0 and 100),
  relevance_tier      text,
  relevance_reasons   text[],
  generated_subject   text,
  generated_bodies    jsonb,
  prompt_version_id   uuid,
  added_at            timestamptz default now(),
  last_event_at       timestamptz,
  unique (person_id, campaign_id)
);
create index pic_campaign_idx on public.people_in_campaign(campaign_id);
create index pic_person_idx   on public.people_in_campaign(person_id);
create index pic_client_idx   on public.people_in_campaign(client_id);

-- ========= Enrichment log (audit of every API call) =========
create table public.enrichments (
  id              bigserial primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  person_id       uuid references public.people(id) on delete cascade,
  company_id      uuid references public.companies(id) on delete cascade,
  campaign_id     uuid references public.campaigns(id) on delete set null,
  provider        text not null,
  endpoint        text not null,
  request_payload jsonb,
  response_payload jsonb,
  outcome         text not null check (outcome in ('hit','miss','error','pending')),
  email_returned  citext,
  verification_status text,
  credits_used    numeric(10,4),
  usd_cost        numeric(12,6) not null default 0,
  provider_request_id text,
  latency_ms      int,
  error_code      text,
  error_message   text,
  created_at      timestamptz default now()
);
create index enrichments_person_idx   on public.enrichments(person_id);
create index enrichments_company_idx  on public.enrichments(company_id);
create index enrichments_provider_idx on public.enrichments(provider, created_at desc);
create index enrichments_campaign_idx on public.enrichments(campaign_id);

-- ========= Prompts (versioned) =========
create table public.prompts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  kind        text not null check (kind in ('relevance','messages','enrichment')),
  name        text not null,
  description text,
  created_at  timestamptz default now(),
  unique (client_id, kind, name)
);

create table public.prompt_versions (
  id                  uuid primary key default gen_random_uuid(),
  prompt_id           uuid not null references public.prompts(id) on delete cascade,
  version             int not null,
  parent_id           uuid references public.prompt_versions(id),
  system_template     text not null,
  user_template       text not null,
  default_model       text,
  default_temperature numeric(3,2) default 0.2,
  schema_json         jsonb,
  notes               text,
  is_active           boolean not null default false,
  traffic_weight      int not null default 0,
  created_at          timestamptz default now(),
  unique (prompt_id, version)
);
create index on public.prompt_versions(prompt_id, is_active);

create table public.experiments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  prompt_id    uuid references public.prompts(id) on delete cascade,
  name         text not null,
  variant_a_id uuid references public.prompt_versions(id),
  variant_b_id uuid references public.prompt_versions(id),
  split        int default 50,
  status       text default 'running',
  started_at   timestamptz default now(),
  ended_at     timestamptz
);

create table public.prompt_runs (
  id                 uuid primary key default gen_random_uuid(),
  prompt_version_id  uuid references public.prompt_versions(id),
  llm_call_log_id    uuid,
  input_variables    jsonb,
  rendered_prompt    text,
  output             jsonb,
  person_id          uuid references public.people(id),
  campaign_id        uuid references public.campaigns(id),
  experiment_id      uuid references public.experiments(id),
  created_at         timestamptz default now()
);

-- ========= LLM / integration config =========
create table public.llm_providers_config (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  feature     text not null check (feature in ('scoring','messages','enrichment','search')),
  provider    text not null,
  model       text not null,
  temperature numeric(3,2) default 0.2,
  max_tokens  int default 1024,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (org_id, feature)
);

create table public.api_integrations_config (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  provider    text not null check (provider in
              ('apify','findymail','signalhire','instantly','perplexity',
               'openai','anthropic','google','xai')),
  label       text,
  api_key_vault_ref text,
  config      jsonb not null default '{}',
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ========= Jobs observability =========
create table public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  job_id      text not null,
  type        text not null,
  attempt     int not null default 1,
  status      text not null check (status in ('running','succeeded','failed','retrying')),
  payload     jsonb,
  output      jsonb,
  error       text,
  cost_usd    numeric(12,6) default 0,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create index on public.job_runs(started_at desc);
create index on public.job_runs(type, status);
create index on public.job_runs(org_id);

-- ========= Cost tracking rollup =========
create table public.cost_tracking (
  id          bigserial primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  provider    text not null,
  usd_cost    numeric(12,6) not null,
  units       numeric(12,4),
  unit_type   text,
  ref_id      text,
  day         date not null default current_date,
  created_at  timestamptz default now()
);
create index on public.cost_tracking(org_id, day);
create index on public.cost_tracking(client_id, day);
create index on public.cost_tracking(campaign_id);

-- ========= Instantly sync state =========
create table public.instantly_sync_state (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  last_sync_at timestamptz,
  last_cursor text,
  stats       jsonb default '{}'
);

-- ========= Message sequences (generated per lead) =========
create table public.message_sequences (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.people(id) on delete cascade,
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  prompt_version_id uuid references public.prompt_versions(id),
  subject         text,
  email_copy_1    text, email_copy_2 text, email_copy_3 text, email_copy_4 text,
  personalization text,
  pushed_to_instantly_at timestamptz,
  created_at      timestamptz default now(),
  unique (person_id, campaign_id)
);

-- ========= Analytics snapshots =========
create table public.analytics_snapshots (
  id          bigserial primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  day         date not null,
  sent        int default 0,
  opened      int default 0,
  replied     int default 0,
  positive_replied int default 0,
  bounced     int default 0,
  unsubscribed int default 0,
  clicked     int default 0,
  completed   int default 0,
  total_interested int default 0,
  total_meeting_booked int default 0,
  raw_payload jsonb,
  unique (campaign_id, day)
);

-- ========= Replies =========
create table public.replies (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  campaign_id       uuid references public.campaigns(id) on delete set null,
  person_id         uuid references public.people(id) on delete set null,
  client_id         uuid references public.clients(id) on delete cascade,
  instantly_event_id text unique,
  is_positive       boolean default false,
  ai_interest_score numeric,
  reply_text        text,
  reply_html        text,
  step              int,
  variant           int,
  received_at       timestamptz,
  created_at        timestamptz default now()
);
create index on public.replies(client_id);
create index on public.replies(person_id);

-- ========= Webhooks log =========
create table public.webhooks_log (
  provider   text not null,
  event_id   text not null,
  payload    jsonb not null,
  received_at timestamptz default now(),
  primary key (provider, event_id)
);

-- ========= SignalHire pending requests =========
create table public.signalhire_pending_requests (
  request_id  text primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  items       jsonb not null,
  status      text not null default 'pending' check (status in ('pending','completed','failed','expired')),
  created_at  timestamptz default now(),
  completed_at timestamptz
);
create index on public.signalhire_pending_requests(org_id, status);

-- ========= Custom fields + table views (for Clay-style dynamic columns) =========
create table public.custom_fields (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  entity       text not null check (entity in ('people','companies')),
  key          text not null,
  label        text not null,
  field_type   text not null,
  config       jsonb not null default '{}',
  sort_order   int not null default 0,
  created_at   timestamptz default now(),
  unique (org_id, entity, key)
);

create table public.table_views (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  entity       text not null,
  name         text not null,
  column_state jsonb not null,
  filters      jsonb not null default '[]',
  sorts        jsonb not null default '[]',
  is_default   bool not null default false,
  updated_at   timestamptz default now()
);

-- ========= updated_at triggers =========
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

do $$ declare t text;
begin
  for t in values
    ('clients'),('companies'),('people'),('campaigns')
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.tg_set_updated_at();', t);
  end loop;
end $$;


-- ===== 00000000000002_rls.sql =====
create schema if not exists private;

create or replace function private.current_org_ids()
returns setof uuid language sql stable security definer set search_path='' as $$
  select org_id from public.memberships where user_id = (select auth.uid());
$$;
grant execute on function private.current_org_ids() to authenticated;

-- Enable RLS everywhere
do $$ declare t text; begin
  for t in values
    ('organizations'),('memberships'),('clients'),('companies'),('people'),
    ('emails'),('audiences'),('campaigns'),('people_in_campaign'),
    ('enrichments'),('prompts'),('prompt_versions'),('prompt_runs'),('experiments'),
    ('llm_providers_config'),('api_integrations_config'),('job_runs'),
    ('cost_tracking'),('instantly_sync_state'),('message_sequences'),
    ('analytics_snapshots'),('replies'),('webhooks_log'),
    ('signalhire_pending_requests'),
    ('custom_fields'),('table_views')
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- Membership: a user sees only their own memberships
create policy memberships_self on public.memberships
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Organizations: read if in
create policy orgs_read on public.organizations
  for select to authenticated
  using (id in (select private.current_org_ids()));

-- Generic org-scoped read+write for tenant tables that carry `org_id` directly.
do $$ declare t text; begin
  for t in values
    ('clients'),('audiences'),('campaigns'),
    ('enrichments'),('prompts'),
    ('experiments'),('llm_providers_config'),('api_integrations_config'),
    ('job_runs'),('cost_tracking'),('analytics_snapshots'),
    ('replies'),('custom_fields'),('table_views'),
    ('signalhire_pending_requests')
  loop
    execute format($f$
      create policy %I_rw on public.%I
        for all to authenticated
        using (org_id in (select private.current_org_ids()))
        with check (org_id in (select private.current_org_ids()));
    $f$, t, t);
  end loop;
end $$;

-- prompt_versions + prompt_runs: scoped through their parent `prompts.org_id`.
create policy prompt_versions_rw on public.prompt_versions
  for all to authenticated
  using (prompt_id in (select id from public.prompts where org_id in (select private.current_org_ids())))
  with check (prompt_id in (select id from public.prompts where org_id in (select private.current_org_ids())));

create policy prompt_runs_rw on public.prompt_runs
  for all to authenticated
  using (
    prompt_version_id in (
      select pv.id from public.prompt_versions pv
      join public.prompts p on p.id = pv.prompt_id
      where p.org_id in (select private.current_org_ids())
    )
  )
  with check (
    prompt_version_id in (
      select pv.id from public.prompt_versions pv
      join public.prompts p on p.id = pv.prompt_id
      where p.org_id in (select private.current_org_ids())
    )
  );

-- Global tables (people, companies, emails): readable by any authenticated user in any org,
-- writable via server actions / edge functions only (service role).
create policy people_read    on public.people     for select to authenticated using (true);
create policy companies_read on public.companies  for select to authenticated using (true);
create policy emails_read    on public.emails     for select to authenticated using (true);

-- people_in_campaign / message_sequences: scoped by client -> org
create policy pic_rw on public.people_in_campaign
  for all to authenticated
  using (client_id in (select id from public.clients where org_id in (select private.current_org_ids())))
  with check (client_id in (select id from public.clients where org_id in (select private.current_org_ids())));

create policy ms_rw on public.message_sequences
  for all to authenticated
  using (campaign_id in (select id from public.campaigns where org_id in (select private.current_org_ids())))
  with check (campaign_id in (select id from public.campaigns where org_id in (select private.current_org_ids())));

-- Instantly sync state: tied to campaign
create policy iss_rw on public.instantly_sync_state
  for all to authenticated
  using (campaign_id in (select id from public.campaigns where org_id in (select private.current_org_ids())))
  with check (campaign_id in (select id from public.campaigns where org_id in (select private.current_org_ids())));

-- Webhooks log: admin-only read
create policy webhooks_admin_read on public.webhooks_log
  for select to authenticated using (false);


-- ===== 00000000000003_queues.sql =====
select pgmq.create('jobs');
select pgmq.create('webhooks');
select pgmq.create('dlq');

create or replace function public.queue_health()
returns table(queue_name text, queue_length bigint, oldest_msg_age_sec int)
language sql security definer set search_path='' as $$
  select queue_name::text, queue_length, oldest_msg_age_sec
  from pgmq.metrics_all()
  where queue_name in ('jobs','webhooks','dlq');
$$;
grant execute on function public.queue_health() to authenticated;

create or replace function public.extend_vt(p_queue text, p_msg_id bigint, p_offset int)
returns void language sql security definer set search_path='' as $$
  select (select 1 from pgmq.set_vt(p_queue, p_msg_id, p_offset));
$$;
revoke all on function public.extend_vt(text,bigint,int) from anon, authenticated;

-- SECURITY DEFINER wrapper for the client to enqueue its own org's jobs
create or replace function public.enqueue_job(p_type text, p_payload jsonb, p_org_id uuid, p_delay int default 0)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_id bigint; v_msg jsonb;
begin
  if p_org_id not in (select private.current_org_ids()) then
    raise exception 'forbidden';
  end if;
  v_msg := jsonb_build_object(
    'type', p_type,
    'payload', p_payload,
    'org_id', p_org_id,
    'job_id', gen_random_uuid()::text
  );
  select pgmq.send('jobs', v_msg, p_delay) into v_id;
  return v_id;
end $$;
grant execute on function public.enqueue_job(text,jsonb,uuid,int) to authenticated;


-- ===== 00000000000004_cron.sql =====
-- Store Vault secrets once (run manually in SQL editor):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_key>',        'service_role_key');

create or replace function private.invoke_edge(name text, body jsonb default '{}')
returns bigint language plpgsql security definer set search_path='' as $$
declare req_id bigint;
begin
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name='project_url')
              || '/functions/v1/' || name,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name='service_role_key')
    ),
    body    := body,
    timeout_milliseconds := 5000
  ) into req_id;
  return req_id;
end $$;

-- dispatch jobs every 10s
select cron.schedule('dispatch-jobs', '10 seconds',
  $$ select private.invoke_edge('worker', jsonb_build_object('ts', now())) $$);

-- sync Instantly stats daily at 05:00 UTC
select cron.schedule('instantly-daily-sync', '0 5 * * *',
  $$ select private.invoke_edge('instantly-sync', '{}'::jsonb) $$);

-- purge cron history
select cron.schedule('purge-cron-history', '0 3 * * 0',
  $$ delete from cron.job_run_details where end_time < now() - interval '14 days' $$);


-- ===== 00000000000005_realtime.sql =====
alter publication supabase_realtime add table public.people;
alter publication supabase_realtime add table public.companies;
alter publication supabase_realtime add table public.enrichments;
alter publication supabase_realtime add table public.job_runs;
alter publication supabase_realtime add table public.people_in_campaign;
alter publication supabase_realtime add table public.message_sequences;
alter publication supabase_realtime add table public.replies;


-- ===== 00000000000006_functions.sql =====
-- AI Search helper: compile LLM-generated filter tree + FTS query
create or replace function public.search_people(
  p_text text default null,
  p_org_id uuid default null,
  p_limit int default 50
) returns setof public.people
language sql stable security invoker set search_path='' as $$
  select p.* from public.people p
  where ($1 is null or p.search_doc @@ plainto_tsquery('simple', $1))
  order by ts_rank_cd(p.search_doc, plainto_tsquery('simple', coalesce($1,''))) desc nulls last
  limit coalesce($3, 50);
$$;
grant execute on function public.search_people(text,uuid,int) to authenticated;

create or replace function public.replay_dlq(p_msg_id bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_msg jsonb; v_new_id bigint;
begin
  select message into v_msg from pgmq.read('dlq', 30, 1) where msg_id = p_msg_id limit 1;
  if v_msg is null then raise exception 'msg not found'; end if;
  select pgmq.send('jobs', v_msg) into v_new_id;
  perform pgmq.archive('dlq', p_msg_id);
  return v_new_id;
end $$;
grant execute on function public.replay_dlq(bigint) to authenticated;

-- Convenience RPC: bootstrap an org + membership for a freshly-signed-up user
-- Called from a Server Action on first login if the user has no membership.
create or replace function public.bootstrap_user_org(p_org_name text default 'My Agency')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user_id uuid; v_org_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not authenticated'; end if;

  select org_id into v_org_id
  from public.memberships
  where user_id = v_user_id
  limit 1;
  if v_org_id is not null then return v_org_id; end if;

  insert into public.organizations (name) values (p_org_name) returning id into v_org_id;
  insert into public.memberships (user_id, org_id, role) values (v_user_id, v_org_id, 'owner');

  return v_org_id;
end $$;
grant execute on function public.bootstrap_user_org(text) to authenticated;


-- ===== 00000000000007_csv_import.sql =====
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


-- =====================================================================
-- Vault secrets (needed by pg_cron → pg_net → Edge Function invocation).
-- Replace the two values below before running this section.
-- =====================================================================
-- select vault.create_secret('https://vthkjjdmfyawwtvbvwnk.supabase.co', 'project_url');
-- select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>',                   'service_role_key');
