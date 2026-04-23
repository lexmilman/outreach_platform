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
