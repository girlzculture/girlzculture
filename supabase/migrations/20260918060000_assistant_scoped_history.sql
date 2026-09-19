begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Client history is accessed only through the authenticated server routes,
-- which recheck present field-level permissions. An old raw JSON result may
-- contain fields that the actor could see before a permission downgrade.
-- Keep the audit intact, but never expose its unprojected data through REST.
alter policy assistant_actor_read on public.gc_assistant_requests using (false);

create or replace function public.save_gc_assistant_request(p_request jsonb,p_notices jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype; saved public.gc_assistant_requests%rowtype; v_scope jsonb;
begin
  r:=jsonb_populate_record(null::public.gc_assistant_requests,p_request);
  perform 1 from public.platform_identities where user_id=r.requested_by for share;
  perform 1 from public.salon_team_members where salon_id=r.salon_id and user_id=r.requested_by for share;
  if r.tool='get_earnings_summary' and r.risk_class=1 and r.permission='earnings' then
    v_scope:=public.business_finance_scope(r.salon_id,r.requested_by);
    if v_scope->>'kind'='own' and (r.result->>'scope' is distinct from 'own_stylist_only'
      or r.result->>'scope_stylist_id' is distinct from v_scope->>'stylist_id') then
      raise exception 'ASSISTANT_ACCESS_DENIED';
    end if;
  elsif not public.p0_actor_has_permission(r.salon_id,r.requested_by,r.permission) then
    raise exception 'ASSISTANT_ACCESS_DENIED';
  end if;
  insert into public.gc_assistant_requests(id,salon_id,requested_by,locale,tool,arguments,execution_payload,risk_class,permission,digest,before_summary,result)
    values(r.id,r.salon_id,r.requested_by,r.locale,r.tool,r.arguments,r.execution_payload,r.risk_class,r.permission,r.digest,r.before_summary,r.result)
    on conflict(id) do nothing returning * into saved;
  if not found then
    select * into saved from public.gc_assistant_requests where id=r.id and salon_id=r.salon_id and requested_by=r.requested_by;
    if not found or (saved.locale,saved.tool,saved.arguments) is distinct from (r.locale,r.tool,r.arguments) then raise exception 'ASSISTANT_IDEMPOTENCY_CONFLICT'; end if;
    -- The server has freshly projected reads. Never replay broader historical
    -- results in the concurrent-idempotency path; the audit remains unchanged.
    return case when r.risk_class=1 then to_jsonb(saved)||jsonb_build_object('result',r.result) else to_jsonb(saved) end;
  end if;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)
    values(saved.id,case when saved.risk_class=1 then 'read' else 'prepared' end,saved.requested_by,jsonb_build_object('notices',p_notices));
  return to_jsonb(saved);
end $$;
revoke all on function public.save_gc_assistant_request(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_gc_assistant_request(jsonb,jsonb) to service_role;
update public.engine_settings set published_value='"20260918060000"'::jsonb,draft_value='"20260918060000"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
