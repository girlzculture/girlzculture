begin;

alter table public.notification_delivery_log drop constraint if exists notification_delivery_log_event_type_check;
alter table public.notification_delivery_log add constraint notification_delivery_log_event_type_check
  check (event_type in ('booking_confirmed','booking_cancelled') or event_type ~ '^booking_reminder_[0-9]+h$');

create table if not exists public.booking_reminder_claims (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  reminder_hours integer not null check (reminder_hours between 1 and 336),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  primary key (booking_id, reminder_hours)
);

alter table public.booking_reminder_claims enable row level security;

create or replace function public.claim_booking_reminder(p_booking_id uuid,p_reminder_hours integer)
returns boolean language plpgsql security definer set search_path=public,auth as $$
declare v_claimed boolean:=false;
begin
  if p_reminder_hours<1 or p_reminder_hours>336 then raise exception 'REMINDER_HOURS_INVALID';end if;
  insert into public.booking_reminder_claims(booking_id,reminder_hours,claimed_at,completed_at,error_message)
  values(p_booking_id,p_reminder_hours,now(),null,null)
  on conflict(booking_id,reminder_hours) do update
    set claimed_at=excluded.claimed_at,error_message=null
    where booking_reminder_claims.completed_at is null
      and booking_reminder_claims.claimed_at<now()-interval '30 minutes'
  returning true into v_claimed;
  return coalesce(v_claimed,false);
end $$;

revoke all on function public.claim_booking_reminder(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_booking_reminder(uuid,integer) to service_role;

insert into public.engine_settings(setting_key,category,display_name,description,value_type,draft_value,published_value,status,impact_level,validation,help_text,impact_description,is_public,is_secret_status,sort_order,affected_surfaces)
values('notifications.booking_reminder_subject','notifications','Booking reminder email subject','Subject used for customer appointment reminder emails.','text','"Your Girlz Culture appointment is coming up"','"Your Girlz Culture appointment is coming up"','Published','customer','{"minLength":5,"maxLength":140}','Do not place private appointment details in the subject line.','Affects future customer reminder emails.',false,false,15,array['Customer reminder email'])
on conflict(setting_key) do nothing;

commit;
