begin;

-- A reminder remains in the worker's due window for fifty minutes. Give an
-- active worker a short lease, make a recorded failure eligible for the next
-- 15-minute scheduled run, and stop permanently after three provider attempts.
alter table public.booking_reminder_claims
  add column if not exists attempt_count integer not null default 0,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists terminal_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.booking_reminder_claims
set attempt_count=greatest(attempt_count,1),
    lease_expires_at=case
      when completed_at is null and error_message is null
        then claimed_at+interval '5 minutes'
      else null
    end,
    next_attempt_at=case
      when completed_at is null and error_message is not null then now()
      else null
    end,
    updated_at=now()
where attempt_count=0
   or (
     completed_at is null
     and terminal_at is null
     and lease_expires_at is null
     and next_attempt_at is null
   );

alter table public.booking_reminder_claims
  alter column attempt_count set default 1;

alter table public.booking_reminder_claims
  drop constraint if exists booking_reminder_claims_attempt_count_check;
alter table public.booking_reminder_claims
  add constraint booking_reminder_claims_attempt_count_check
  check(attempt_count between 1 and 3) not valid;
alter table public.booking_reminder_claims
  validate constraint booking_reminder_claims_attempt_count_check;

create or replace function public.claim_booking_reminder(
  p_booking_id uuid,
  p_reminder_hours integer
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_claimed boolean:=false;
begin
  if p_booking_id is null or p_reminder_hours<1 or p_reminder_hours>336 then
    raise exception using errcode='22023',message='REMINDER_CLAIM_INVALID';
  end if;

  insert into public.booking_reminder_claims as claim(
    booking_id,reminder_hours,claimed_at,completed_at,error_message,
    attempt_count,lease_expires_at,next_attempt_at,terminal_at,updated_at
  ) values(
    p_booking_id,p_reminder_hours,now(),null,null,
    1,now()+interval '5 minutes',null,null,now()
  )
  on conflict(booking_id,reminder_hours) do update
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
  p_reference text
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
  if p_booking_id is null or p_reminder_hours<1 or p_reminder_hours>336 then
    raise exception using errcode='22023',message='REMINDER_FAILURE_INVALID';
  end if;

  select * into v_claim
  from public.booking_reminder_claims
  where booking_id=p_booking_id and reminder_hours=p_reminder_hours
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
    where booking_id=p_booking_id and reminder_hours=p_reminder_hours;
    return 'terminal';
  end if;

  update public.booking_reminder_claims
  set error_message='REMINDER_FAILED_REFERENCE:'||v_reference,
      lease_expires_at=null,
      next_attempt_at=now()+interval '1 minute',
      updated_at=now()
  where booking_id=p_booking_id and reminder_hours=p_reminder_hours;
  return 'retryable';
end;
$$;

revoke all on function public.claim_booking_reminder(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.claim_booking_reminder(uuid,integer)
  to service_role;
revoke all on function public.fail_booking_reminder_claim(uuid,integer,text)
  from public,anon,authenticated;
grant execute on function public.fail_booking_reminder_claim(uuid,integer,text)
  to service_role;

comment on function public.claim_booking_reminder(uuid,integer) is
  'Atomically leases a due reminder for at most three bounded attempts; completed and terminal claims cannot be reclaimed.';
comment on function public.fail_booking_reminder_claim(uuid,integer,text) is
  'Releases a failed reminder for the next scheduled run or terminalizes its third failed attempt while retaining only a sanitized Engine reference.';

update public.engine_settings
set published_value='"20260807230000"'::jsonb,
    draft_value='"20260807230000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';

commit;
