begin;
-- Closing controls new messages only. Original messages, evidence and permitted
-- translations remain readable. A confirmed reschedule changes this deadline;
-- a proposed date does not. Cancellation closes immediately.
create function public.booking_conversation_open(p_booking public.bookings)
returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select (p_booking.booking_origin is distinct from 'business_added' or p_booking.customer_id is not null)
   and p_booking.appointment_datetime is not null and p_booking.duration_hours>0
   and coalesce(p_booking.status,'') !~* 'cancel|declined|expired|rejected'
   and statement_timestamp()<p_booking.appointment_datetime+(p_booking.duration_hours*interval '1 hour')+interval '24 hours';
$$;
revoke all on function public.booking_conversation_open(public.bookings) from public,anon,authenticated;
grant execute on function public.booking_conversation_open(public.bookings) to service_role;

create function public.guard_booking_conversation_send() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare b public.bookings%rowtype; i public.platform_identities%rowtype; team public.salon_team_members%rowtype; permitted boolean:=false;
begin
 select * into i from public.platform_identities where user_id=new.sender_user_id for share;
 if not found or i.status<>'Active' or not exists(select 1 from auth.users u where u.id=i.user_id and lower(trim(u.email))=i.email_normalized) then raise exception 'MESSAGE_ACCESS_DENIED'; end if;
 select * into team from public.salon_team_members where salon_id=new.salon_id and user_id=new.sender_user_id for share;
 -- Serialize with changes to the confirmed time, status and assigned stylist.
 select * into b from public.bookings where id=new.booking_id and salon_id=new.salon_id for share;
 if not found then raise exception 'MESSAGE_ACCESS_DENIED'; end if;
 if new.sender_role='customer' and i.primary_role='customer' and b.customer_id=i.user_id then permitted:=true;
 elsif new.sender_role='salon' then
   perform 1 from public.salons where id=b.salon_id for share;
   permitted:=(i.primary_role='salon_owner' and exists(select 1 from public.salons where id=b.salon_id and user_id=i.user_id))
     or (i.primary_role='salon_team' and team.status='Active' and coalesce((team.permissions->>'bookings')::boolean,false) and (team.stylist_id is null or team.stylist_id=b.stylist_id));
 end if;
 if permitted is distinct from true then raise exception 'MESSAGE_ACCESS_DENIED'; end if;
 -- Preserve the existing route's exact-payload idempotency check on retries,
 -- even if a previously successful message is acknowledged after closure.
 if new.client_request_id is not null and exists(select 1 from public.booking_messages where sender_user_id=new.sender_user_id and client_request_id=new.client_request_id) then raise unique_violation using message='MESSAGE_REQUEST_EXISTS'; end if;
 if public.booking_conversation_open(b) is distinct from true then raise exception 'MESSAGE_CONVERSATION_CLOSED'; end if;
 return new;
end $$;
revoke all on function public.guard_booking_conversation_send() from public,anon,authenticated;
create trigger guard_booking_conversation_send before insert on public.booking_messages for each row execute function public.guard_booking_conversation_send();

-- The direct Data API and conversation-event policies use the same assignment
-- boundary as the server, without hiding retained history after closure.
create or replace function public.p0_booking_message_access(p_booking uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.bookings b join public.platform_identities i on i.user_id=auth.uid()
   join auth.users u on u.id=i.user_id
   where b.id=p_booking and i.status='Active' and i.email_normalized=lower(trim(u.email)) and (
     (i.primary_role='customer' and b.customer_id=i.user_id)
     or (i.primary_role='salon_owner' and exists(select 1 from public.salons s where s.id=b.salon_id and s.user_id=i.user_id))
     or (i.primary_role='salon_team' and exists(select 1 from public.salon_team_members t where t.salon_id=b.salon_id and t.user_id=i.user_id and t.status='Active' and coalesce((t.permissions->>'bookings')::boolean,false) and (t.stylist_id is null or t.stylist_id=b.stylist_id)))
     or (i.primary_role='admin' and exists(select 1 from public.admin_users a where a.user_id=i.user_id and a.status='Active' and (a.is_super_admin or coalesce((a.permissions->>'support')::boolean,false))))));
$$;
revoke all on function public.p0_booking_message_access(uuid) from public,anon;
grant execute on function public.p0_booking_message_access(uuid) to authenticated,service_role;

-- Message previews are private too: push and in-app recipients must have the
-- same fresh assignment boundary as the conversation they would open.
create function public.booking_message_business_recipient(p_salon uuid,p_booking uuid,p_user uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.bookings b where b.id=p_booking and b.salon_id=p_salon
   and public.p0_actor_has_permission(p_salon,p_user,'bookings') and (
     exists(select 1 from public.salons s where s.id=p_salon and s.user_id=p_user)
     or exists(select 1 from public.salon_team_members t where t.salon_id=p_salon and t.user_id=p_user and t.status='Active' and (t.stylist_id is null or t.stylist_id=b.stylist_id))));
$$;
revoke all on function public.booking_message_business_recipient(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.booking_message_business_recipient(uuid,uuid,uuid) to service_role;

create or replace function public.notify_booking_message_in_app() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype; recipient uuid; recipient_role text; destination text;
begin
  select * into b from public.bookings where id=new.booking_id;
  if not found or b.salon_id<>new.salon_id then raise exception 'MESSAGE_BOOKING_MISMATCH'; end if;
  recipient_role:=case when new.sender_role='customer' then 'salon' else 'customer' end;
  destination:=case when recipient_role='salon' then '/salon/dashboard/messages/'||b.id::text else '/account?tab=inbox&booking='||b.id::text end;
  for recipient in
    select b.customer_id where recipient_role='customer' and b.customer_id is not null
    union select s.user_id from public.salons s where recipient_role='salon' and s.id=b.salon_id and public.booking_message_business_recipient(s.id,b.id,s.user_id)
    union select m.user_id from public.salon_team_members m where recipient_role='salon' and m.salon_id=b.salon_id and public.booking_message_business_recipient(m.salon_id,b.id,m.user_id)
  loop
    perform public.upsert_dashboard_notification(recipient,b.salon_id,b.id,recipient_role,'messages','info','New booking message',
      left(coalesce(new.original_body,new.body),140),destination,'booking-message:'||new.id::text,jsonb_build_object('message_id',new.id,'source_original',true));
  end loop;
  return new;
end $$;

update public.engine_settings set published_value='"20260918150923"',draft_value='"20260918150923"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
