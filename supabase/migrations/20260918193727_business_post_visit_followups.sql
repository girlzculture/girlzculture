begin;
-- Forward-only queue: installing this migration never schedules past visits.
-- Customers must separately opt in for this business (or this guest booking).
create table public.booking_followup_queue (
 booking_id uuid primary key references public.bookings(id) on delete cascade,
 schedule_revision integer not null, due_at timestamptz not null, expires_at timestamptz not null,
 status text not null default 'pending' check(status in('pending','sent')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 lease_id uuid, lease_until timestamptz, next_attempt_at timestamptz,
 completed_at timestamptz, failure_reference uuid,
 check(expires_at>due_at)
);
alter table public.booking_followup_queue enable row level security;
revoke all on public.booking_followup_queue from public,anon,authenticated;
grant all on public.booking_followup_queue to service_role;
-- Invoker RPCs need explicit read/row-lock privileges even on a fresh database
-- without Supabase's usual default service-role table grants. No browser role
-- gains access, and the queue RPCs remain revoked from those roles.
grant select,update on public.bookings to service_role;
create index booking_followup_pending on public.booking_followup_queue(due_at) where status='pending' and attempts<3;

create schema if not exists gc_private;
revoke all on schema gc_private from public,anon,authenticated;
-- The trigger needs to write the private queue even when a permitted booking
-- update originates from a role without direct queue privileges.
create function gc_private.enqueue_booking_followup() returns trigger
language plpgsql security definer set search_path='' as $$
declare visit_end timestamptz;
begin
 if new.status<>'Completed' or new.booking_origin<>'marketplace' or new.duration_hours is null or new.duration_hours<=0 then return new;end if;
 if tg_op='UPDATE' and old.status='Completed' and old.schedule_revision=new.schedule_revision then return new;end if;
 visit_end:=new.appointment_datetime+pg_catalog.make_interval(secs=>(new.duration_hours*3600)::integer);
 if visit_end+interval '72 hours'<=now() then return new;end if;
 insert into public.booking_followup_queue(booking_id,schedule_revision,due_at,expires_at)
 values(new.id,new.schedule_revision,visit_end+interval '24 hours',visit_end+interval '72 hours')
 on conflict(booking_id) do update set schedule_revision=excluded.schedule_revision,due_at=excluded.due_at,
 expires_at=excluded.expires_at,attempts=0,lease_id=null,lease_until=null,next_attempt_at=null,failure_reference=null
 where booking_followup_queue.status='pending';
 return new;
end $$;
revoke all on function gc_private.enqueue_booking_followup() from public,anon,authenticated,service_role;
create trigger enqueue_booking_followup after insert or update on public.bookings
for each row execute function gc_private.enqueue_booking_followup();

-- Only the protected scheduler's service role can reserve or finish a batch.
-- Lock booking first, as booking updates/triggers do, to avoid inverse locks.
create function public.claim_due_booking_followups(p_limit integer default 10)
returns table(booking_id uuid,lease_id uuid) language plpgsql security invoker set search_path='' as $$
declare item record;lease uuid;
begin
 if p_limit is null or p_limit<1 or p_limit>25 then raise exception 'FOLLOWUP_BATCH_INVALID';end if;
 for item in
  select b.id from public.bookings b join public.booking_followup_queue q on q.booking_id=b.id
  join lateral(select p.* from public.business_communication_preferences p where p.salon_id=b.salon_id
    and (p.guest_booking_id=b.id or p.customer_id=b.customer_id) order by (p.guest_booking_id is not null) desc limit 1) pref on true
  where q.status='pending' and q.attempts<3 and q.due_at<=now() and q.expires_at>now()
   and coalesce(q.lease_until,q.due_at)<=now() and coalesce(q.next_attempt_at,q.due_at)<=now()
   and b.status='Completed' and b.booking_origin='marketplace' and b.schedule_revision=q.schedule_revision
   and pref.follow_up and (pref.email_enabled or pref.sms_enabled or pref.push_enabled)
  order by q.due_at,b.id limit p_limit for update of b,q skip locked
 loop
  lease:=gen_random_uuid();
  update public.booking_followup_queue q set lease_id=lease,lease_until=now()+interval '10 minutes',attempts=attempts+1 where q.booking_id=item.id;
  booking_id:=item.id;lease_id:=lease;return next;
 end loop;
end $$;
revoke all on function public.claim_due_booking_followups(integer) from public,anon,authenticated;
grant execute on function public.claim_due_booking_followups(integer) to service_role;

create function public.claim_followup_notification_delivery(p_booking_id uuid,p_event_type text,p_recipient_type text,p_channel text,p_destination text,p_deduplication_key text,p_lease uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b public.bookings%rowtype;q public.booking_followup_queue%rowtype;
begin
 if p_event_type<>'booking_follow_up' or p_recipient_type<>'customer' then return null;end if;
 select * into b from public.bookings where id=p_booking_id for update;
 select * into q from public.booking_followup_queue where booking_id=p_booking_id for update;
 if q.booking_id is null or q.status<>'pending' or q.lease_id is distinct from p_lease or q.lease_until<=now()
  or q.due_at>now() or q.expires_at<=now() or b.status<>'Completed' or b.schedule_revision<>q.schedule_revision then return null;end if;
 -- Existing final consent/channel gate is checked inside this same transaction.
 return public.claim_notification_delivery(p_booking_id,p_event_type,p_recipient_type,p_channel,p_destination,p_deduplication_key);
end $$;
revoke all on function public.claim_followup_notification_delivery(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_followup_notification_delivery(uuid,text,text,text,text,text,uuid) to service_role;

create function public.finish_booking_followup(p_booking uuid,p_lease uuid,p_success boolean,p_reference uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.booking_followup_queue set status=case when p_success then 'sent' else 'pending' end,
  completed_at=case when p_success then now() else null end,failure_reference=p_reference,
  next_attempt_at=case when p_success then null else now()+interval '15 minutes' end,lease_until=null,lease_id=null
 where booking_id=p_booking and status='pending' and lease_id=p_lease and lease_until>now();
 return found;
end $$;
revoke all on function public.finish_booking_followup(uuid,uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.finish_booking_followup(uuid,uuid,boolean,uuid) to service_role;
update public.engine_settings set published_value='"20260918193727"'::jsonb,draft_value='"20260918193727"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
