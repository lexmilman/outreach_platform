-- Hotfix: rename invoke_edge's first parameter from `name` to `fn_name`
-- to avoid ambiguity with the `name` column on vault.decrypted_secrets.
--
-- Symptom before fix: cron ticks every 10 s, invoke_edge throws
--   ERROR 42702 "column reference `name` is ambiguous"
-- at runtime, so pg_net never actually POSTs to /functions/v1/worker and
-- the queue just piles up.
--
-- Postgres rejects CREATE OR REPLACE when only parameter names change,
-- so we drop the old signature first. cron.schedule stores the command
-- as plain text ("select private.invoke_edge('worker', ...)") and re-
-- resolves the function name each tick, so the cron job keeps working.
--
-- Paste into SQL Editor and Run. Safe to re-run.

drop function if exists private.invoke_edge(text, jsonb);

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
