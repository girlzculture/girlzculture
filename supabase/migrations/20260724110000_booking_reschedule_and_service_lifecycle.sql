begin;

alter table public.booking_reschedule_options
  add column if not exists stylist_id uuid references public.stylists(id) on delete set null;

create index if not exists booking_reschedule_options_stylist_idx
  on public.booking_reschedule_options(stylist_id, appointment_datetime);

alter table public.bookings
  add column if not exists checked_in_at timestamptz,
  add column if not exists service_completed_at timestamptz,
  add column if not exists service_state_corrected_at timestamptz,
  add column if not exists service_state_corrected_by uuid references auth.users(id) on delete set null;

alter table public.booking_audit_log
  drop constraint if exists booking_audit_log_action_check;
alter table public.booking_audit_log
  add constraint booking_audit_log_action_check
  check(action in (
    'created','modified','rescheduled','status_changed','cancelled','refunded',
    'reschedule_proposed','reschedule_declined','checked_in','service_started',
    'service_completed','service_state_corrected'
  ));

create or replace function public.create_booking_reschedule_proposal(
  p_booking_id uuid,
  p_salon_id uuid,
  p_proposed_by_user_id uuid,
  p_proposed_by_role text,
  p_reason text,
  p_message text,
  p_options jsonb,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_booking public.bookings;
  v_proposal_id uuid;
  v_option jsonb;
  v_datetime timestamptz;
  v_duration numeric;
  v_stylist_id uuid;
begin
  select * into v_booking from public.bookings
    where id=p_booking_id and salon_id=p_salon_id for update;
  if not found then
    raise exception using errcode='22023',message='BOOKING_NOT_FOUND';
  end if;
  if lower(coalesce(v_booking.status,'')) in ('cancelled','canceled','completed','refunded') then
    raise exception using errcode='22023',message='BOOKING_CANNOT_BE_RESCHEDULED';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception using errcode='22023',message='RESCHEDULE_REASON_REQUIRED';
  end if;
  if jsonb_typeof(p_options)<>'array'
    or jsonb_array_length(p_options)<1
    or jsonb_array_length(p_options)>5 then
    raise exception using errcode='22023',message='RESCHEDULE_OPTIONS_REQUIRED';
  end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '14 days' then
    raise exception using errcode='22023',message='RESCHEDULE_EXPIRY_INVALID';
  end if;
  for v_option in select value from jsonb_array_elements(p_options)
  loop
    begin
      v_datetime:=(v_option->>'appointment_datetime')::timestamptz;
      v_duration:=(v_option->>'duration_hours')::numeric;
      v_stylist_id:=nullif(v_option->>'stylist_id','')::uuid;
    exception when others then
      raise exception using errcode='22023',message='RESCHEDULE_OPTION_INVALID';
    end;
    if v_datetime<=now() or v_duration<0.25 or v_duration>24 then
      raise exception using errcode='22023',message='RESCHEDULE_OPTION_INVALID';
    end if;
    if v_stylist_id is not null and not exists(
      select 1 from public.stylists
      where id=v_stylist_id and salon_id=v_booking.salon_id and is_active=true
    ) then
      raise exception using errcode='22023',message='RESCHEDULE_STYLIST_UNAVAILABLE';
    end if;
  end loop;

  update public.booking_reschedule_proposals
    set status='Superseded',updated_at=now()
    where booking_id=v_booking.id and status='Pending';
  insert into public.booking_reschedule_proposals(
    booking_id,salon_id,proposed_by_user_id,proposed_by_role,message,reason,
    previous_appointment_datetime,expires_at
  ) values(
    v_booking.id,v_booking.salon_id,p_proposed_by_user_id,
    left(coalesce(nullif(trim(p_proposed_by_role),''),'salon'),60),
    nullif(left(trim(coalesce(p_message,'')),600),''),
    left(trim(p_reason),300),v_booking.appointment_datetime,p_expires_at
  ) returning id into v_proposal_id;
  insert into public.booking_reschedule_options(
    proposal_id,appointment_datetime,duration_hours,stylist_id
  )
  select
    v_proposal_id,
    (value->>'appointment_datetime')::timestamptz,
    (value->>'duration_hours')::numeric,
    nullif(value->>'stylist_id','')::uuid
  from jsonb_array_elements(p_options);
  insert into public.booking_audit_log(
    booking_id,actor_user_id,actor_role,action,reason,before_data,after_data
  ) values(
    v_booking.id,p_proposed_by_user_id,left(p_proposed_by_role,80),
    'reschedule_proposed',left(trim(p_reason),500),
    to_jsonb(v_booking),to_jsonb(v_booking)
  );
  return v_proposal_id;
end;
$$;

revoke all on function public.create_booking_reschedule_proposal(
  uuid,uuid,uuid,text,text,text,jsonb,timestamptz
) from public,anon,authenticated;
grant execute on function public.create_booking_reschedule_proposal(
  uuid,uuid,uuid,text,text,text,jsonb,timestamptz
) to service_role;

create or replace function public.respond_booking_reschedule(
  p_proposal_id uuid,
  p_option_id uuid,
  p_response text
) returns public.bookings
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_proposal public.booking_reschedule_proposals;
  v_booking public.bookings;
  v_option public.booking_reschedule_options;
  v_blocked_until timestamptz;
  v_resource_id uuid;
  v_before jsonb;
begin
  if p_response not in ('accept','decline') then
    raise exception using errcode='22023',message='INVALID_RESCHEDULE_RESPONSE';
  end if;
  select * into v_proposal from public.booking_reschedule_proposals
    where id=p_proposal_id for update;
  if not found or v_proposal.status<>'Pending' or v_proposal.expires_at<=now() then
    raise exception using errcode='22023',message='RESCHEDULE_PROPOSAL_UNAVAILABLE';
  end if;
  select * into v_booking from public.bookings
    where id=v_proposal.booking_id for update;
  if not found or lower(coalesce(v_booking.status,'')) in ('cancelled','canceled','completed','refunded') then
    raise exception using errcode='22023',message='BOOKING_CANNOT_BE_RESCHEDULED';
  end if;
  v_before:=to_jsonb(v_booking);

  if p_response='decline' then
    update public.booking_reschedule_proposals
      set status='Declined',responded_at=now(),updated_at=now()
      where id=v_proposal.id;
    return v_booking;
  end if;

  select * into v_option from public.booking_reschedule_options
    where id=p_option_id and proposal_id=v_proposal.id for update;
  if not found or v_option.appointment_datetime<=now() then
    raise exception using errcode='22023',message='RESCHEDULE_OPTION_UNAVAILABLE';
  end if;
  if v_option.stylist_id is not null and not exists(
    select 1 from public.stylists
    where id=v_option.stylist_id and salon_id=v_booking.salon_id and is_active=true
  ) then
    raise exception using errcode='22023',message='RESCHEDULE_STYLIST_UNAVAILABLE';
  end if;
  v_resource_id:=coalesce(v_option.stylist_id,v_booking.salon_id);
  v_blocked_until:=v_option.appointment_datetime
    +make_interval(secs => (v_option.duration_hours*3600)::double precision)
    +make_interval(mins => greatest(coalesce(v_booking.buffer_minutes,15),0));

  perform pg_advisory_xact_lock(hashtextextended('resource:'||v_resource_id::text,0));
  if v_booking.normalized_guest_email is not null then
    perform pg_advisory_xact_lock(hashtextextended('customer:'||v_booking.normalized_guest_email,0));
  end if;
  if v_booking.customer_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('customer-id:'||v_booking.customer_id::text,0));
  end if;

  if exists(
    select 1 from public.bookings b
    where b.id<>v_booking.id and b.booking_resource_id=v_resource_id
      and b.is_active_booking
      and b.booking_window&&tstzrange(v_option.appointment_datetime,v_blocked_until,'[)')
  ) or exists(
    select 1 from public.booking_checkout_intents i
    where i.is_pending_intent and i.expires_at>now()
      and i.booking_resource_id=v_resource_id
      and i.checkout_window&&tstzrange(v_option.appointment_datetime,v_blocked_until,'[)')
  ) then
    raise exception using errcode='23P01',message='BOOKING_RESOURCE_CONFLICT';
  end if;
  if v_booking.normalized_guest_email is not null and exists(
    select 1 from public.bookings b
    where b.id<>v_booking.id and b.normalized_guest_email=v_booking.normalized_guest_email
      and b.is_active_booking
      and b.booking_window&&tstzrange(v_option.appointment_datetime,v_blocked_until,'[)')
  ) then
    raise exception using errcode='23P01',message='CUSTOMER_BOOKING_CONFLICT';
  end if;
  if v_booking.customer_id is not null and exists(
    select 1 from public.bookings b
    where b.id<>v_booking.id and b.customer_id=v_booking.customer_id
      and b.is_active_booking
      and b.booking_window&&tstzrange(v_option.appointment_datetime,v_blocked_until,'[)')
  ) then
    raise exception using errcode='23P01',message='CUSTOMER_BOOKING_CONFLICT';
  end if;

  update public.bookings set
    appointment_datetime=v_option.appointment_datetime,
    duration_hours=v_option.duration_hours,
    stylist_id=v_option.stylist_id,
    status='Confirmed'
  where id=v_booking.id returning * into v_booking;
  update public.booking_reschedule_options set is_selected=(id=v_option.id)
    where proposal_id=v_proposal.id;
  update public.booking_reschedule_proposals
    set status='Accepted',selected_option_id=v_option.id,responded_at=now(),updated_at=now()
    where id=v_proposal.id;
  update public.booking_reschedule_proposals
    set status='Superseded',updated_at=now()
    where booking_id=v_booking.id and id<>v_proposal.id and status='Pending';
  insert into public.booking_audit_log(
    booking_id,actor_user_id,actor_role,action,reason,before_data,after_data
  ) values(
    v_booking.id,null,'Guest customer','rescheduled',v_proposal.reason,v_before,to_jsonb(v_booking)
  );
  return v_booking;
end;
$$;

revoke all on function public.respond_booking_reschedule(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.respond_booking_reschedule(uuid,uuid,text)
  to service_role;

create or replace function public.transition_booking_service(
  p_booking_id uuid,
  p_salon_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_action text,
  p_reason text default null,
  p_target_status text default null
) returns public.bookings
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_booking public.bookings;
  v_before jsonb;
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_target text:=trim(coalesce(p_target_status,''));
begin
  select * into v_booking from public.bookings
    where id=p_booking_id and salon_id=p_salon_id for update;
  if not found then
    raise exception using errcode='22023',message='BOOKING_NOT_FOUND';
  end if;
  v_before:=to_jsonb(v_booking);

  if v_action='check_in' then
    if lower(coalesce(v_booking.status,''))<>'confirmed' or v_booking.checked_in_at is not null then
      raise exception using errcode='22023',message='BOOKING_NOT_READY_FOR_CHECK_IN';
    end if;
    update public.bookings
      set status='Ready',checked_in_at=now()
      where id=v_booking.id returning * into v_booking;
    v_action:='checked_in';
  elsif v_action='start' then
    if lower(coalesce(v_booking.status,''))<>'ready' or v_booking.service_started_at is not null then
      raise exception using errcode='22023',message='BOOKING_NOT_READY_TO_START';
    end if;
    update public.bookings
      set status='In Progress',service_started_at=now()
      where id=v_booking.id returning * into v_booking;
    v_action:='service_started';
  elsif v_action='complete' then
    if lower(coalesce(v_booking.status,''))<>'in progress' or v_booking.service_completed_at is not null then
      raise exception using errcode='22023',message='BOOKING_NOT_READY_TO_COMPLETE';
    end if;
    update public.bookings
      set status='Completed',service_completed_at=now()
      where id=v_booking.id returning * into v_booking;
    v_action:='service_completed';
  elsif v_action='admin_correct' then
    if position('admin' in lower(coalesce(p_actor_role,'')))=0
      or nullif(trim(coalesce(p_reason,'')),'') is null
      or v_target not in ('Confirmed','Ready','In Progress','Completed','Cancelled') then
      raise exception using errcode='22023',message='SERVICE_STATE_CORRECTION_INVALID';
    end if;
    update public.bookings set
      status=v_target,
      checked_in_at=case when v_target='Confirmed' then null else checked_in_at end,
      service_started_at=case when v_target in ('Confirmed','Ready') then null else service_started_at end,
      service_completed_at=case when v_target='Completed' then coalesce(service_completed_at,now()) else null end,
      service_state_corrected_at=now(),
      service_state_corrected_by=p_actor_user_id
    where id=v_booking.id returning * into v_booking;
    v_action:='service_state_corrected';
  else
    raise exception using errcode='22023',message='SERVICE_ACTION_INVALID';
  end if;

  insert into public.booking_audit_log(
    booking_id,actor_user_id,actor_role,action,reason,before_data,after_data
  ) values(
    v_booking.id,p_actor_user_id,left(coalesce(p_actor_role,'Unknown'),80),
    v_action,nullif(left(trim(coalesce(p_reason,'')),500),''),
    v_before,to_jsonb(v_booking)
  );
  return v_booking;
end;
$$;

revoke all on function public.transition_booking_service(
  uuid,uuid,uuid,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.transition_booking_service(
  uuid,uuid,uuid,text,text,text,text
) to service_role;

comment on column public.bookings.checked_in_at is
  'UTC timestamp captured when the customer is checked in and the booking enters Ready.';
comment on column public.bookings.service_completed_at is
  'UTC timestamp captured by the atomic Completed transition; enables verified review eligibility.';
comment on function public.transition_booking_service(
  uuid,uuid,uuid,text,text,text,text
) is 'Atomic, audited booking service state machine. Callable only through protected service-role routes.';

commit;
