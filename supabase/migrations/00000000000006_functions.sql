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
