begin;
alter table public.booking_reschedule_proposals
 add column client_request_id uuid,
 add column request_hash text,
 add column previous_stylist_id uuid,
 add column previous_duration_hours numeric;
create unique index booking_reschedule_request_unique on public.booking_reschedule_proposals(salon_id,proposed_by_user_id,client_request_id) where client_request_id is not null;

-- Keep the established audit/options behavior behind a fresh authorization and
-- idempotency boundary. Only this wrapper can call the internal implementation.
alter function public.create_booking_reschedule_proposal(uuid,uuid,uuid,text,text,text,jsonb,timestamptz) rename to create_booking_reschedule_proposal_internal;
revoke all on function public.create_booking_reschedule_proposal_internal(uuid,uuid,uuid,text,text,text,jsonb,timestamptz) from public,anon,authenticated,service_role;
create function public.create_booking_reschedule_proposal(
 p_booking_id uuid,p_salon_id uuid,p_proposed_by_user_id uuid,p_proposed_by_role text,p_reason text,p_message text,p_options jsonb,p_expires_at timestamptz,p_request_id uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare b public.bookings%rowtype; i public.platform_identities%rowtype; m public.salon_team_members%rowtype;
 prior public.booking_reschedule_proposals%rowtype; fingerprint text; result uuid; allowed boolean:=false; actor_role text;
begin
 select * into i from public.platform_identities where user_id=p_proposed_by_user_id for share;
 if not found or i.status<>'Active' then raise exception 'RESCHEDULE_FORBIDDEN'; end if;
 if i.primary_role='salon_owner' and exists(select 1 from public.salons where id=p_salon_id and user_id=i.user_id) then allowed:=true;actor_role:='Salon owner';
 elsif i.primary_role='admin' then
  perform 1 from public.admin_users where user_id=i.user_id and status='Active' and (is_super_admin or coalesce((permissions->>'bookings')::boolean,false)) for share;
  allowed:=found; actor_role:='Platform admin';
 else
  select * into m from public.salon_team_members where salon_id=p_salon_id and user_id=i.user_id for share;
  allowed:=found and i.primary_role='salon_team' and m.status='Active' and coalesce((m.permissions->>'bookings')::boolean,false);actor_role:='Salon team';
 end if;
 if not allowed then raise exception 'RESCHEDULE_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||p_salon_id::text,0));
 select * into b from public.bookings where id=p_booking_id and salon_id=p_salon_id for update;
 if not found or (m.stylist_id is not null and m.stylist_id is distinct from b.stylist_id) then raise exception 'RESCHEDULE_FORBIDDEN'; end if;
 fingerprint:=md5(jsonb_build_array(p_booking_id,trim(p_reason),nullif(trim(p_message),''),p_options)::text);
 if p_request_id is not null then
  select * into prior from public.booking_reschedule_proposals where salon_id=p_salon_id and proposed_by_user_id=p_proposed_by_user_id and client_request_id=p_request_id;
  if found then
   if prior.request_hash is distinct from fingerprint then raise exception 'RESCHEDULE_REQUEST_REUSED'; end if;
   return prior.id;
  end if;
 end if;
 if b.booking_origin='business_added' and b.customer_id is null then raise exception 'RESCHEDULE_CUSTOMER_LINK_REQUIRED'; end if;
 if b.appointment_datetime<=now() or lower(b.status) not in ('confirmed','pending') or b.service_started_at is not null then raise exception 'BOOKING_CANNOT_BE_RESCHEDULED'; end if;
 if jsonb_typeof(p_options)<>'array' or exists(select 1 from jsonb_array_elements(p_options) o where (o->>'duration_hours')::numeric is distinct from b.duration_hours) then raise exception 'RESCHEDULE_BOOKED_DURATION_REQUIRED'; end if;
 if exists(select 1 from jsonb_array_elements(p_options) o where nullif(o->>'stylist_id','') is not null and not exists(select 1 from public.stylists s where s.id=(o->>'stylist_id')::uuid and s.salon_id=b.salon_id and s.is_active is not false and s.is_draft is not true and s.archived_at is null and (s.assigned_service_ids is null or b.style_id=any(s.assigned_service_ids)))) then raise exception 'RESCHEDULE_STYLIST_UNAVAILABLE'; end if;
 result:=public.create_booking_reschedule_proposal_internal(p_booking_id,p_salon_id,p_proposed_by_user_id,actor_role,p_reason,p_message,p_options,p_expires_at);
 update public.booking_reschedule_proposals set client_request_id=p_request_id,request_hash=fingerprint,previous_stylist_id=b.stylist_id,previous_duration_hours=b.duration_hours where id=result;
 return result;
end $$;
revoke all on function public.create_booking_reschedule_proposal(uuid,uuid,uuid,text,text,text,jsonb,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.create_booking_reschedule_proposal(uuid,uuid,uuid,text,text,text,jsonb,timestamptz,uuid) to service_role;

-- Match proposal lock order to creation; never accept an offer against an
-- appointment which has changed since the offer was prepared.
alter function public.respond_booking_reschedule(uuid,uuid,text) rename to respond_booking_reschedule_internal;
revoke all on function public.respond_booking_reschedule_internal(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.respond_booking_reschedule(p_proposal_id uuid,p_option_id uuid,p_response text)
 returns public.bookings language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.booking_reschedule_proposals%rowtype; b public.bookings%rowtype;
begin
 select * into p from public.booking_reschedule_proposals where id=p_proposal_id;
 if not found then raise exception 'RESCHEDULE_PROPOSAL_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||p.salon_id::text,0));
 select * into b from public.bookings where id=p.booking_id and salon_id=p.salon_id for update;
 select * into p from public.booking_reschedule_proposals where id=p_proposal_id for update;
 if p_response='accept' and (b.appointment_datetime is distinct from p.previous_appointment_datetime or (p.previous_duration_hours is not null and (b.stylist_id,b.duration_hours) is distinct from (p.previous_stylist_id,p.previous_duration_hours)) or b.service_started_at is not null) then raise exception 'RESCHEDULE_PROPOSAL_UNAVAILABLE'; end if;
 if p_response='accept' and exists(select 1 from public.booking_reschedule_options o where o.id=p_option_id and o.proposal_id=p.id and o.stylist_id is not null and not exists(select 1 from public.stylists s where s.id=o.stylist_id and s.salon_id=b.salon_id and s.is_active is not false and s.is_draft is not true and s.archived_at is null and (s.assigned_service_ids is null or b.style_id=any(s.assigned_service_ids)))) then raise exception 'RESCHEDULE_STYLIST_UNAVAILABLE'; end if;
 return public.respond_booking_reschedule_internal(p_proposal_id,p_option_id,p_response);
end $$;
revoke all on function public.respond_booking_reschedule(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.respond_booking_reschedule(uuid,uuid,text) to service_role;

-- Reuse a live signed management link during per-channel notification retries.
-- Only hashes persist. Explicit customer security rotations remain unchanged.
create function public.claim_booking_communication_token(p_booking uuid,p_id uuid,p_hash text,p_expires timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.booking_guest_access_tokens%rowtype;
begin
 perform 1 from public.bookings where id=p_booking for update;
 if not found or p_id is null or p_hash !~ '^[0-9a-f]{64}$' or p_expires<=now() then raise exception 'BOOKING_COMMUNICATION_TOKEN_INVALID'; end if;
 select * into t from public.booking_guest_access_tokens where booking_id=p_booking and purpose='manage' and revoked_at is null and expires_at>now()+interval '5 minutes' order by expires_at desc,id limit 1;
 if not found then
  insert into public.booking_guest_access_tokens(id,booking_id,token_hash,purpose,expires_at) values(p_id,p_booking,p_hash,'manage',p_expires) returning * into t;
  insert into public.booking_guest_access_audit(booking_id,token_id,action,outcome,metadata) values(p_booking,t.id,'issued','completed','{"reason":"Booking communication"}');
 end if;
 return jsonb_build_object('id',t.id,'token_hash',t.token_hash,'expires_at',t.expires_at);
end $$;
revoke all on function public.claim_booking_communication_token(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_booking_communication_token(uuid,uuid,text,timestamptz) to service_role;

alter table public.notification_delivery_log drop constraint notification_delivery_log_event_type_check;
alter table public.notification_delivery_log add constraint notification_delivery_log_event_type_check check(event_type in ('booking_confirmed','booking_cancelled') or event_type ~ '^booking_reminder_[0-9]+h$' or event_type ~ '^booking_message:[0-9a-f-]{36}$' or event_type ~ '^reschedule_proposal:[0-9a-f-]{36}$' or event_type ~ '^reschedule_accepted:[0-9a-f-]{36}$');
update public.engine_settings set published_value='"20260918160921"',draft_value='"20260918160921"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
