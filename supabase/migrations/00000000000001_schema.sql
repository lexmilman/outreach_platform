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
