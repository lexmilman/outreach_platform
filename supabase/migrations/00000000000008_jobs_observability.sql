-- Sprint 3.1 — observability for the worker queue.
--
-- Two things:
--   1) Fix replay_dlq: the original used pgmq.read('dlq',30,1) WHERE msg_id=...
--      but pgmq.read returns the next visible message regardless of any WHERE
--      filter, so the fetch was effectively unfiltered. Read directly from the
--      queue table instead.
--   2) Add list_dlq() so the /jobs page can show pending DLQ messages without
--      consuming visibility timeout (a true peek).

create or replace function public.replay_dlq(p_msg_id bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_msg jsonb; v_new_id bigint;
begin
  select message into v_msg from pgmq.q_dlq where msg_id = p_msg_id;
  if v_msg is null then raise exception 'msg not found in dlq: %', p_msg_id; end if;
  select pgmq.send('jobs', v_msg) into v_new_id;
  perform pgmq.archive('dlq', p_msg_id);
  return v_new_id;
end $$;

grant execute on function public.replay_dlq(bigint) to authenticated;

create or replace function public.list_dlq(p_limit int default 100)
returns table(msg_id bigint, enqueued_at timestamptz, read_ct int, message jsonb)
language sql security definer set search_path='' as $$
  select msg_id, enqueued_at, read_ct, message
  from pgmq.q_dlq
  order by msg_id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

grant execute on function public.list_dlq(int) to authenticated;
