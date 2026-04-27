-- Sprint 3 verification — operator-visibility for worker + explicit service_role grants.
--
-- Two things:
-- 1. worker_log: a tiny structured-log table the worker writes into so the
--    operator can see what's happening without staring at Supabase
--    Dashboard's logs (which only surface access logs, not stdout/stderr
--    from inside Edge Functions).
-- 2. Explicit `grant execute … to service_role` on every finalizer RPC the
--    worker calls. They work today via SECURITY DEFINER + PUBLIC chain,
--    but explicit grants are bulletproof.

-- ---------------------------------------------------------------------
-- worker_log

create table if not exists public.worker_log (
  id          bigserial primary key,
  level       text not null check (level in ('info','warn','error')),
  job_id      text,
  type        text,
  message     text not null,
  context     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists worker_log_created_idx on public.worker_log(created_at desc);
create index if not exists worker_log_job_idx on public.worker_log(job_id) where job_id is not null;

alter table public.worker_log enable row level security;

-- Read for any authenticated user (operator). Worker writes via service_role
-- which bypasses RLS.
drop policy if exists worker_log_read on public.worker_log;
create policy worker_log_read on public.worker_log
  for select to authenticated
  using (true);

-- Insert helper RPC the worker calls. Keeping it as an RPC so PostgREST can
-- invoke it cleanly from the supabase-js admin client.
create or replace function public.worker_log_write(
  p_level   text,
  p_message text,
  p_job_id  text default null,
  p_type    text default null,
  p_context jsonb default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.worker_log (level, message, job_id, type, context)
  values (p_level, p_message, p_job_id, p_type, p_context)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.worker_log_write(text,text,text,text,jsonb) from anon, authenticated;
grant execute on function public.worker_log_write(text,text,text,text,jsonb) to service_role;

-- Daily purge of rows older than 7 days (keeps table small).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'purge-worker-log') then
    perform cron.schedule(
      'purge-worker-log', '15 3 * * *',
      $cmd$ delete from public.worker_log where created_at < now() - interval '7 days' $cmd$
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Explicit service_role grants for every finalizer the worker calls.

-- pgmq wrappers (migration 9):
grant execute on function public.pgmq_send(text,jsonb,int)         to service_role;
grant execute on function public.pgmq_read(text,int,int)           to service_role;
grant execute on function public.pgmq_delete(text,bigint)          to service_role;
grant execute on function public.pgmq_archive(text,bigint)         to service_role;
grant execute on function public.extend_vt(text,bigint,int)        to service_role;

-- apify finalizers (migration 9):
grant execute on function public.apify_finalize_person(bigint,jsonb,numeric)  to service_role;
grant execute on function public.apify_finalize_company(bigint,jsonb,numeric) to service_role;
grant execute on function public.apify_finalize_posts(bigint,jsonb,numeric)   to service_role;

-- email finalizers (migration 10):
grant execute on function public.record_email(uuid,public.citext,text,int,text)         to service_role;
grant execute on function public.findymail_finalize(bigint,public.citext,numeric)       to service_role;
grant execute on function public.signalhire_finalize_item(bigint,text,jsonb,numeric)    to service_role;
grant execute on function public.instantly_verify_finalize(bigint,uuid,text,numeric)    to service_role;

-- LLM finalizers (migration 11):
grant execute on function public.score_lead_finalize(uuid,int,text,text[],uuid,numeric)              to service_role;
grant execute on function public.generate_messages_finalize(uuid,text,jsonb,text,uuid,numeric)       to service_role;
grant execute on function public.llm_input_for_pic(uuid)                                             to service_role;

-- perplexity finalizer (migration 12):
grant execute on function public.perplexity_finalize(bigint,text,jsonb,numeric) to service_role;
