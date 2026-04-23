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
