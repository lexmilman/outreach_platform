-- Paste into SQL Editor and Run.
-- Sprint 3.x — audience <-> person join table.
--
-- Audiences are per-org named cohorts; people are GLOBAL (shared across orgs).
-- To answer "which people are in this audience?" we need a join table.
-- RLS on the join is derived from audience.org_id (via the parent row).

create table if not exists public.audience_members (
  audience_id uuid not null references public.audiences(id) on delete cascade,
  person_id   uuid not null references public.people(id)    on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (audience_id, person_id)
);
create index if not exists audience_members_person_idx on public.audience_members(person_id);

alter table public.audience_members enable row level security;

drop policy if exists audience_members_rw on public.audience_members;
create policy audience_members_rw on public.audience_members
  for all to authenticated
  using (
    audience_id in (
      select id from public.audiences
      where org_id in (select private.current_org_ids())
    )
  )
  with check (
    audience_id in (
      select id from public.audiences
      where org_id in (select private.current_org_ids())
    )
  );

-- -------------------------------------------------------------------
-- link_audience_members — called by the CSV import Server Action after
-- bulk_upsert_people. Looks up people by linkedin_url OR linkedin_hash_id
-- (whichever is present in the source CSV) and inserts the missing
-- membership rows. Idempotent via ON CONFLICT DO NOTHING.

create or replace function public.link_audience_members(
  p_audience_id  uuid,
  p_linkedin_urls text[] default '{}',
  p_hash_ids      text[] default '{}'
) returns int
language plpgsql security definer set search_path = '' as $$
declare v_linked int := 0;
begin
  -- Require that the caller owns the audience (via org membership).
  if not exists (
    select 1 from public.audiences a
    where a.id = p_audience_id
      and a.org_id in (select private.current_org_ids())
  ) then
    raise exception 'forbidden';
  end if;

  with matched as (
    select distinct p.id as person_id
    from public.people p
    where
      (p.linkedin_url = any(coalesce(p_linkedin_urls, '{}'::text[])))
      or
      (p.linkedin_hash_id = any(coalesce(p_hash_ids, '{}'::text[])))
  ),
  ins as (
    insert into public.audience_members (audience_id, person_id)
    select p_audience_id, m.person_id from matched m
    on conflict (audience_id, person_id) do nothing
    returning 1
  )
  select count(*)::int into v_linked from ins;

  return v_linked;
end $$;

grant execute on function public.link_audience_members(uuid, text[], text[]) to authenticated;
