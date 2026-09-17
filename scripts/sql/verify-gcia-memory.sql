-- Disposable clean database only; all fixtures roll back.
begin;
do $$
declare
  actor uuid := gen_random_uuid(); business uuid := gen_random_uuid();
  rejected boolean;
begin
  if not (select relrowsecurity from pg_class where oid='public.gc_assistant_memory'::regclass) then raise exception 'Memory RLS is required'; end if;
  if has_table_privilege('anon','public.gc_assistant_memory','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.gc_assistant_memory','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Memory must not expose a direct client access path';
  end if;
  -- Use the same canonical owner setup as the existing business/calendar SQL
  -- fixtures. Without a role, the auth trigger correctly creates a customer.
  insert into auth.users(id,email,raw_user_meta_data)
    values(actor,'memory-fixture@example.test','{"role":"salon_owner"}'::jsonb);
  insert into public.salons(id,user_id,name,slug,email,status) values(business,actor,'Memory fixture','memory-'||business,'memory-fixture@example.test','Active');
  insert into public.gc_assistant_memory(salon_id,requested_by,request_ids,locale,saved_at,expires_at)
    values(business,actor,array[gen_random_uuid()],'es',now(),now()+interval '30 days');
  rejected:=false;
  begin update public.gc_assistant_memory set expires_at=now()+interval '31 days' where salon_id=business;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Memory retention cap was bypassed'; end if;
  rejected:=false;
  begin update public.gc_assistant_memory set request_ids=array_fill(gen_random_uuid(),array[7]) where salon_id=business;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Memory context bound was bypassed'; end if;
  rejected:=false;
  begin update public.gc_assistant_memory set request_ids=array[null::uuid] where salon_id=business;
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Memory accepted a null reference'; end if;
  -- Scheduled cleanup cannot remove a current bookmark.
  delete from public.gc_assistant_memory where expires_at<=now();
  if not exists(select 1 from public.gc_assistant_memory where salon_id=business) then raise exception 'Cleanup removed current context'; end if;
  update public.gc_assistant_memory set saved_at=now()-interval '31 days',expires_at=now()-interval '1 day' where salon_id=business;
  delete from public.gc_assistant_memory where expires_at<=now();
  if exists(select 1 from public.gc_assistant_memory where salon_id=business) then raise exception 'Cleanup did not remove expired context'; end if;
end $$;
rollback;
