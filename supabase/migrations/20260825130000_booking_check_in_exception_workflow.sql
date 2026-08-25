-- Server-enforced booking check-in windows with early/late exception reasons,
-- attestation, and immutable audit evidence.

begin;

alter table public.bookings
  add column if not exists scheduled_at_check_in timestamptz,
  add column if not exists check_in_offset_minutes integer,
  add column if not exists check_in_exception_kind text,
  add column if not exists check_in_reason_code text,
  add column if not exists check_in_reason_detail text,
  add column if not exists check_in_attested boolean not null default false,
  add column if not exists check_in_time_zone text;

alter table public.bookings
  drop constraint if exists bookings_check_in_exception_kind_check,
  add constraint bookings_check_in_exception_kind_check
    check (check_in_exception_kind is null or check_in_exception_kind in ('early','late')),
  drop constraint if exists bookings_check_in_reason_detail_length_check,
  add constraint bookings_check_in_reason_detail_length_check
    check (check_in_reason_detail is null or char_length(check_in_reason_detail)<=500);

create or replace function public.transition_booking_service_v2(
  p_booking_id uuid,
  p_salon_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_action text,
  p_reason_code text default null,
  p_reason_detail text default null,
  p_attested boolean default false,
  p_target_status text default null,
  p_time_zone text default 'America/New_York'
) returns public.bookings
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare
  v_booking public.bookings;
  v_before jsonb;
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_target text:=trim(coalesce(p_target_status,''));
  v_reason_code text:=lower(trim(coalesce(p_reason_code,'')));
  v_reason_detail text:=nullif(left(trim(coalesce(p_reason_detail,'')),500),'');
  v_offset integer;
  v_exception_kind text;
  v_reason text;
  v_early_reasons constant text[]:=array[
    'customer_arrived_early',
    'customer_requested_earlier_by_phone',
    'customer_requested_earlier_by_message',
    'salon_and_customer_agreed_earlier',
    'customer_arrived_as_walk_in',
    'appointment_changed_outside_platform',
    'other'
  ];
  v_late_reasons constant text[]:=array[
    'customer_arrived_late',
    'salon_running_behind',
    'salon_and_customer_agreed_later',
    'appointment_changed_outside_platform',
    'service_completed_check_in_not_recorded',
    'technical_problem',
    'staff_forgot_check_in',
    'other'
  ];
begin
  select * into v_booking
  from public.bookings
  where id=p_booking_id and salon_id=p_salon_id
  for update;
  if not found then
    raise exception using errcode='22023',message='BOOKING_NOT_FOUND';
  end if;
  v_before:=to_jsonb(v_booking);

  if v_action='check_in' then
    if lower(coalesce(v_booking.status,''))<>'confirmed'
       or v_booking.checked_in_at is not null then
      raise exception using errcode='22023',message='BOOKING_NOT_READY_FOR_CHECK_IN';
    end if;
    v_offset:=floor(extract(epoch from (now()-v_booking.appointment_datetime))/60)::integer;
    if v_offset < -30 then
      v_exception_kind:='early';
      if not p_attested or not (v_reason_code=any(v_early_reasons)) then
        raise exception using errcode='22023',message='EARLY_CHECK_IN_REASON_REQUIRED';
      end if;
    elsif v_offset > 60 then
      v_exception_kind:='late';
      if not p_attested or not (v_reason_code=any(v_late_reasons)) then
        raise exception using errcode='22023',message='LATE_CHECK_IN_REASON_REQUIRED';
      end if;
    else
      v_exception_kind:=null;
      v_reason_code:='within_standard_window';
    end if;
    if v_reason_code='other' and v_reason_detail is null then
      raise exception using errcode='22023',message='CHECK_IN_OTHER_DETAIL_REQUIRED';
    end if;
    update public.bookings
    set status='Ready',
        checked_in_at=now(),
        scheduled_at_check_in=appointment_datetime,
        check_in_offset_minutes=v_offset,
        check_in_exception_kind=v_exception_kind,
        check_in_reason_code=v_reason_code,
        check_in_reason_detail=v_reason_detail,
        check_in_attested=case when v_exception_kind is null then false else p_attested end,
        check_in_time_zone=left(coalesce(nullif(trim(p_time_zone),''),'America/New_York'),80)
    where id=v_booking.id
    returning * into v_booking;
    v_action:='checked_in';
    v_reason:=case
      when v_exception_kind is null then 'Check-in occurred inside the standard 30-minute-before through 60-minute-after window.'
      else format('%s check-in exception: %s%s',v_exception_kind,v_reason_code,case when v_reason_detail is null then '' else ' — '||v_reason_detail end)
    end;
  elsif v_action='start' then
    if lower(coalesce(v_booking.status,''))<>'ready'
       or v_booking.checked_in_at is null
       or v_booking.service_started_at is not null then
      raise exception using errcode='22023',message='BOOKING_NOT_READY_TO_START';
    end if;
    update public.bookings
    set status='In Progress',service_started_at=now()
    where id=v_booking.id
    returning * into v_booking;
    v_action:='service_started';
    v_reason:='Service started after customer check-in.';
  elsif v_action='complete' then
    if lower(coalesce(v_booking.status,''))<>'in progress'
       or v_booking.service_started_at is null
       or v_booking.service_completed_at is not null then
      raise exception using errcode='22023',message='BOOKING_NOT_READY_TO_COMPLETE';
    end if;
    update public.bookings
    set status='Completed',service_completed_at=now()
    where id=v_booking.id
    returning * into v_booking;
    v_action:='service_completed';
    v_reason:='Salon confirmed that the scheduled service was completed.';
  elsif v_action='admin_correct' then
    if position('admin' in lower(coalesce(p_actor_role,'')))=0
       or v_reason_detail is null
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
    v_reason:=v_reason_detail;
  else
    raise exception using errcode='22023',message='SERVICE_ACTION_INVALID';
  end if;

  insert into public.booking_audit_log(
    booking_id,actor_user_id,actor_role,action,reason,before_data,after_data
  ) values(
    v_booking.id,p_actor_user_id,left(coalesce(p_actor_role,'Unknown'),80),
    v_action,left(coalesce(v_reason,''),500),v_before,to_jsonb(v_booking)
  );
  return v_booking;
end;
$$;

revoke all on function public.transition_booking_service_v2(
  uuid,uuid,uuid,text,text,text,text,boolean,text,text
) from public,anon,authenticated;
grant execute on function public.transition_booking_service_v2(
  uuid,uuid,uuid,text,text,text,text,boolean,text,text
) to service_role;

comment on function public.transition_booking_service_v2(
  uuid,uuid,uuid,text,text,text,text,boolean,text,text
) is 'Atomic service lifecycle with a normal -30/+60 minute check-in window and attested early/late exceptions.';

update public.engine_settings
set published_value='"20260825130000"'::jsonb,
    draft_value='"20260825130000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';

commit;
