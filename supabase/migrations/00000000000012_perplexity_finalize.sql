-- Sprint 3.5 — admin-mode finalizer for Perplexity custom research.
-- Stores the research result + citations in:
--   enrichments.response_payload (audit log)
--   people.data_json -> 'perplexity' (so downstream prompts can reference it)

create or replace function public.perplexity_finalize(
  p_enrichment_id bigint,
  p_content       text,
  p_citations     jsonb,
  p_run_cost_usd  numeric default 0
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_enr public.enrichments%rowtype;
begin
  select * into v_enr from public.enrichments where id = p_enrichment_id;
  if not found then raise exception 'enrichment % not found', p_enrichment_id; end if;

  update public.enrichments set
    response_payload = jsonb_build_object('content', p_content, 'citations', p_citations),
    outcome          = case when p_content is not null and length(p_content) > 0 then 'hit' else 'miss' end,
    usd_cost         = coalesce(p_run_cost_usd, 0)
  where id = p_enrichment_id;

  if v_enr.person_id is not null and p_content is not null then
    update public.people
       set data_json = data_json || jsonb_build_object(
             'perplexity', jsonb_build_object(
               'content', p_content,
               'citations', p_citations,
               'fetched_at', now()
             )
           ),
           updated_at = now()
     where id = v_enr.person_id;
  end if;

  if coalesce(p_run_cost_usd,0) > 0 then
    insert into public.cost_tracking (org_id, provider, usd_cost, ref_id)
    values (v_enr.org_id, 'perplexity', p_run_cost_usd, p_enrichment_id::text);
  end if;
end $$;
revoke all on function public.perplexity_finalize(bigint,text,jsonb,numeric) from anon, authenticated;
