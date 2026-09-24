-- Preserve the catalog identity selected by a reviewed "any service" or fuzzy
-- name proposal. Custom manual services still have no catalog identifier.
-- The existing implementation retains authorization, occupancy, stale-preview
-- checks and the manual-payment/notification boundaries.
alter function public.save_business_added_appointment(uuid,uuid,uuid,jsonb,jsonb,jsonb,text)
  rename to save_business_added_appointment_before_catalog_binding;
create function public.save_business_added_appointment(p_salon uuid,p_actor uuid,p_request uuid,p_args jsonb,p_payload jsonb,p_before jsonb,p_action text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if p_action='prepare_manual_appointment' and nullif(p_args->>'style_id','') is null
    and nullif(p_payload#>>'{service_facts,id}','') is not null then
    p_args:=p_args||jsonb_build_object('style_id',(p_payload#>>'{service_facts,id}')::uuid);
  end if;
  return public.save_business_added_appointment_before_catalog_binding(p_salon,p_actor,p_request,p_args,p_payload,p_before,p_action);
end $$;
revoke all on function public.save_business_added_appointment(uuid,uuid,uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_business_added_appointment(uuid,uuid,uuid,jsonb,jsonb,jsonb,text) to service_role;
