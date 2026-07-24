begin;

alter table public.booking_audit_log
  drop constraint if exists booking_audit_log_action_check;
alter table public.booking_audit_log
  add constraint booking_audit_log_action_check
  check(action in (
    'created','modified','rescheduled','status_changed','cancelled','refunded',
    'reschedule_proposed','reschedule_declined'
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
    exception when others then
      raise exception using errcode='22023',message='RESCHEDULE_OPTION_INVALID';
    end;
    if v_datetime<=now() or v_duration<0.25 or v_duration>24 then
      raise exception using errcode='22023',message='RESCHEDULE_OPTION_INVALID';
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
    proposal_id,appointment_datetime,duration_hours
  )
  select
    v_proposal_id,
    (value->>'appointment_datetime')::timestamptz,
    (value->>'duration_hours')::numeric
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

create or replace function public.audit_declined_reschedule_proposal()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_booking public.bookings;
begin
  if old.status='Pending' and new.status='Declined' then
    select * into v_booking from public.bookings where id=new.booking_id;
    if found then
      insert into public.booking_audit_log(
        booking_id,actor_user_id,actor_role,action,reason,before_data,after_data
      ) values(
        v_booking.id,null,'Guest customer','reschedule_declined',new.reason,
        to_jsonb(v_booking),to_jsonb(v_booking)
      );
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists audit_declined_reschedule_proposal
  on public.booking_reschedule_proposals;
create trigger audit_declined_reschedule_proposal
after update of status on public.booking_reschedule_proposals
for each row execute function public.audit_declined_reschedule_proposal();

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
)
values
('notifications.booking_reschedule_subject','notifications','Reschedule proposal subject','Subject for customer reschedule proposal emails.','text','"Your salon proposed new appointment times"','"Your salon proposed new appointment times"','Published','customer','{"minLength":5,"maxLength":140}','The secure response link and proposed times are always appended.','Affects future reschedule proposal emails.',false,false,130,array['Customer reschedule email'])
on conflict(setting_key) do nothing;

commit;
