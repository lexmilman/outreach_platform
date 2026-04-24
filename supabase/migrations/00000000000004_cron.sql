-- Store Vault secrets once (run manually in SQL editor):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_key>',        'service_role_key');

create or replace function private.invoke_edge(fn_name text, body jsonb default '{}')
returns bigint language plpgsql security definer set search_path='' as $$
declare req_id bigint;
begin
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name='project_url')
              || '/functions/v1/' || fn_name,
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
