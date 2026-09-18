begin;
alter table public.bookings add column schedule_revision integer not null default 0 check(schedule_revision>=0);
create function public.track_booking_schedule_revision() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 new.schedule_revision:=old.schedule_revision;
 if (new.appointment_datetime,new.stylist_id,new.duration_hours,new.buffer_minutes) is distinct from (old.appointment_datetime,old.stylist_id,old.duration_hours,old.buffer_minutes) then new.schedule_revision:=old.schedule_revision+1; end if;
 return new;
end $$;
revoke all on function public.track_booking_schedule_revision() from public,anon,authenticated;
create trigger booking_schedule_revision before update on public.bookings for each row execute function public.track_booking_schedule_revision();
alter table public.booking_reminder_claims add column schedule_revision integer not null default 0 check(schedule_revision>=0);
alter table public.booking_reminder_claims drop constraint booking_reminder_claims_pkey;
alter table public.booking_reminder_claims add primary key(booking_id,reminder_hours,schedule_revision);
create or replace function public.claim_booking_reminder(
  p_booking_id uuid,
  p_reminder_hours integer,
  p_schedule_revision integer
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_claimed boolean:=false;
  b public.bookings%rowtype;
begin
  if p_booking_id is null or p_reminder_hours is null or p_reminder_hours<1 or p_reminder_hours>336 or p_schedule_revision is null or p_schedule_revision<0 then
    raise exception using errcode='22023',message='REMINDER_CLAIM_INVALID';
  end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found or b.status<>'Confirmed' or b.booking_origin<>'marketplace' or b.schedule_revision is distinct from p_schedule_revision
   or b.appointment_datetime<now()+make_interval(hours=>p_reminder_hours)-interval '30 minutes'
   or b.appointment_datetime>=now()+make_interval(hours=>p_reminder_hours)+interval '20 minutes' then return false; end if;
  insert into public.booking_reminder_claims as claim(
    booking_id,reminder_hours,schedule_revision,claimed_at,completed_at,error_message,
    attempt_count,lease_expires_at,next_attempt_at,terminal_at,updated_at
  ) values(
    p_booking_id,p_reminder_hours,p_schedule_revision,now(),null,null,
    1,now()+interval '5 minutes',null,null,now()
  )
  on conflict(booking_id,reminder_hours,schedule_revision) do update
  set claimed_at=now(),
      error_message=null,
      attempt_count=claim.attempt_count+1,
      lease_expires_at=now()+interval '5 minutes',
      next_attempt_at=null,
      updated_at=now()
  where claim.completed_at is null
    and claim.terminal_at is null
    and claim.attempt_count<3
    and (
      (
        claim.error_message is not null
        and coalesce(claim.next_attempt_at,claim.claimed_at)<=now()
      )
      or (
        claim.error_message is null
        and coalesce(
          claim.lease_expires_at,
          claim.claimed_at+interval '5 minutes'
        )<=now()
      )
    )
  returning true into v_claimed;

  return coalesce(v_claimed,false);
end;
$$;


create or replace function public.fail_booking_reminder_claim(
  p_booking_id uuid,
  p_reminder_hours integer,
  p_reference text,
  p_schedule_revision integer
)
returns text
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_claim public.booking_reminder_claims%rowtype;
  v_reference text:=left(
    coalesce(nullif(trim(p_reference),''),'unavailable'),
    100
  );
begin
  if p_booking_id is null or p_reminder_hours is null or p_reminder_hours<1 or p_reminder_hours>336 or p_schedule_revision is null or p_schedule_revision<0 then
    raise exception using errcode='22023',message='REMINDER_FAILURE_INVALID';
  end if;

  select * into v_claim
  from public.booking_reminder_claims
  where booking_id=p_booking_id and reminder_hours=p_reminder_hours and schedule_revision=p_schedule_revision
  for update;

  if not found then
    raise exception using errcode='P0002',message='REMINDER_CLAIM_NOT_FOUND';
  end if;
  if v_claim.completed_at is not null then return 'completed';end if;
  if v_claim.terminal_at is not null then return 'terminal';end if;

  if v_claim.attempt_count>=3 then
    update public.booking_reminder_claims
    set error_message='REMINDER_PERMANENT_FAILURE_REFERENCE:'||v_reference,
        terminal_at=now(),
        lease_expires_at=null,
        next_attempt_at=null,
        updated_at=now()
    where booking_id=p_booking_id and reminder_hours=p_reminder_hours and schedule_revision=p_schedule_revision;
    return 'terminal';
  end if;

  update public.booking_reminder_claims
  set error_message='REMINDER_FAILED_REFERENCE:'||v_reference,
      lease_expires_at=null,
      next_attempt_at=now()+interval '1 minute',
      updated_at=now()
  where booking_id=p_booking_id and reminder_hours=p_reminder_hours and schedule_revision=p_schedule_revision;
  return 'retryable';
end;
$$;


-- Preserve callable legacy signatures during a held deployment; new workers
-- always pass the revision they selected, so an old worker cannot complete it.
create or replace function public.claim_booking_reminder(p_booking_id uuid,p_reminder_hours integer) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin return public.claim_booking_reminder(p_booking_id,p_reminder_hours,0); end $$;
create or replace function public.fail_booking_reminder_claim(p_booking_id uuid,p_reminder_hours integer,p_reference text) returns text language plpgsql security definer set search_path=pg_catalog,public as $$
begin return public.fail_booking_reminder_claim(p_booking_id,p_reminder_hours,p_reference,0); end $$;
create function public.complete_booking_reminder(p_booking_id uuid,p_reminder_hours integer,p_schedule_revision integer) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform set_config('app.reminder_complete_revision',p_schedule_revision::text,true);
 update public.booking_reminder_claims set completed_at=now(),error_message=null,lease_expires_at=null,next_attempt_at=null,updated_at=now()
 where booking_id=p_booking_id and reminder_hours=p_reminder_hours and schedule_revision=p_schedule_revision and completed_at is null and terminal_at is null;
end $$;
create function public.guard_revisioned_reminder_completion() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if old.schedule_revision>0 and new.completed_at is distinct from old.completed_at and current_setting('app.reminder_complete_revision',true) is distinct from old.schedule_revision::text then raise exception 'REMINDER_REVISION_REQUIRED'; end if;
 return new;
end $$;
revoke all on function public.guard_revisioned_reminder_completion() from public,anon,authenticated;
create trigger reminder_revision_completion before update of completed_at on public.booking_reminder_claims for each row execute function public.guard_revisioned_reminder_completion();
revoke all on function public.claim_booking_reminder(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.fail_booking_reminder_claim(uuid,integer,text,integer) from public,anon,authenticated;
revoke all on function public.complete_booking_reminder(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_booking_reminder(uuid,integer,integer) to service_role;
grant execute on function public.fail_booking_reminder_claim(uuid,integer,text,integer) to service_role;
grant execute on function public.complete_booking_reminder(uuid,integer,integer) to service_role;

-- A final serialized gate prevents a cancelled or superseded reminder from
-- reserving any outbound channel after its schedule changes.
create function public.claim_scheduled_notification_delivery(p_booking_id uuid,p_event_type text,p_recipient_type text,p_channel text,p_destination text,p_deduplication_key text,p_schedule_revision integer)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or b.status<>'Confirmed' or b.schedule_revision is distinct from p_schedule_revision then return null; end if;
 return public.claim_notification_delivery(p_booking_id,p_event_type,p_recipient_type,p_channel,p_destination,p_deduplication_key);
end $$;
revoke all on function public.claim_scheduled_notification_delivery(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.claim_scheduled_notification_delivery(uuid,text,text,text,text,text,integer) to service_role;
-- Exclude terminal/leased claims before the batch limit so earlier completed
-- bookings cannot starve later due bookings on every scheduler invocation.
create function public.due_booking_reminders(p_reminder_hours integer)
returns table(id uuid,appointment_datetime timestamptz,schedule_revision integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 select b.id,b.appointment_datetime,b.schedule_revision from public.bookings b
 left join public.booking_reminder_claims c on c.booking_id=b.id and c.reminder_hours=p_reminder_hours and c.schedule_revision=b.schedule_revision
 where p_reminder_hours between 1 and 336 and b.status='Confirmed' and b.booking_origin='marketplace'
 and b.appointment_datetime>=now()+make_interval(hours=>p_reminder_hours)-interval '30 minutes'
 and b.appointment_datetime<now()+make_interval(hours=>p_reminder_hours)+interval '20 minutes'
 and (c.booking_id is null or (c.completed_at is null and c.terminal_at is null and c.attempt_count<3
 and ((c.error_message is not null and coalesce(c.next_attempt_at,c.claimed_at)<=now())
 or (c.error_message is null and coalesce(c.lease_expires_at,c.claimed_at+interval '5 minutes')<=now()))))
 order by b.appointment_datetime,b.id limit 250;
$$;
revoke all on function public.due_booking_reminders(integer) from public,anon,authenticated;
grant execute on function public.due_booking_reminders(integer) to service_role;
update public.engine_settings set published_value='"20260918165227"',draft_value='"20260918165227"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
