begin;

create table if not exists public.booking_guest_access_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'manage' check (purpose in ('manage','recovery')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  rotated_from_id uuid references public.booking_guest_access_tokens(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists booking_guest_access_booking_idx
  on public.booking_guest_access_tokens(booking_id,expires_at desc);
create unique index if not exists booking_guest_access_one_active_idx
  on public.booking_guest_access_tokens(booking_id)
  where revoked_at is null and purpose='manage';

create table if not exists public.booking_guest_access_audit (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  token_id uuid references public.booking_guest_access_tokens(id) on delete set null,
  action text not null check (action in (
    'issued','viewed','cancelled','reschedule_accepted','reschedule_declined',
    'revoked','recovery_requested','recovery_verified','recovery_failed'
  )),
  outcome text not null check (outcome in ('allowed','denied','completed')),
  request_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists booking_guest_access_audit_booking_idx
  on public.booking_guest_access_audit(booking_id,created_at desc);

create table if not exists public.booking_guest_recovery_challenges (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  code_hash text not null,
  destination_type text not null check (destination_type in ('email','phone')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 10),
  request_fingerprint text,
  created_at timestamptz not null default now()
);
create index if not exists booking_guest_recovery_booking_idx
  on public.booking_guest_recovery_challenges(booking_id,created_at desc);

create table if not exists public.booking_reschedule_proposals (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  proposed_by_user_id uuid references auth.users(id) on delete set null,
  proposed_by_role text not null default 'salon',
  message text,
  reason text not null,
  status text not null default 'Pending'
    check (status in ('Pending','Accepted','Declined','Superseded','Expired')),
  previous_appointment_datetime timestamptz not null,
  selected_option_id uuid,
  responded_at timestamptz,
  expires_at timestamptz not null default (now()+interval '72 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists booking_reschedule_proposal_booking_idx
  on public.booking_reschedule_proposals(booking_id,created_at desc);
create unique index if not exists booking_reschedule_one_pending_idx
  on public.booking_reschedule_proposals(booking_id)
  where status='Pending';

create table if not exists public.booking_reschedule_options (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.booking_reschedule_proposals(id) on delete cascade,
  appointment_datetime timestamptz not null,
  duration_hours numeric(6,2) not null check (duration_hours between 0.25 and 24),
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique(proposal_id,appointment_datetime)
);

do $$ begin
  alter table public.booking_reschedule_proposals
    add constraint booking_reschedule_selected_option_fk
    foreign key(selected_option_id) references public.booking_reschedule_options(id) on delete set null;
exception when duplicate_object then null;
end $$;

alter table public.booking_guest_access_tokens enable row level security;
alter table public.booking_guest_access_audit enable row level security;
alter table public.booking_guest_recovery_challenges enable row level security;
alter table public.booking_reschedule_proposals enable row level security;
alter table public.booking_reschedule_options enable row level security;

revoke all on public.booking_guest_access_tokens from public,anon,authenticated;
revoke all on public.booking_guest_access_audit from public,anon,authenticated;
revoke all on public.booking_guest_recovery_challenges from public,anon,authenticated;
revoke all on public.booking_reschedule_proposals from public,anon,authenticated;
revoke all on public.booking_reschedule_options from public,anon,authenticated;
grant all on public.booking_guest_access_tokens to service_role;
grant all on public.booking_guest_access_audit to service_role;
grant all on public.booking_guest_recovery_challenges to service_role;
grant all on public.booking_reschedule_proposals to service_role;
grant all on public.booking_reschedule_options to service_role;

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
  v_blocked_until:=v_option.appointment_datetime
    +make_interval(secs => (v_option.duration_hours*3600)::double precision)
    +make_interval(mins => greatest(coalesce(v_booking.buffer_minutes,15),0));

  perform pg_advisory_xact_lock(hashtextextended('resource:'||v_booking.booking_resource_id::text,0));
  if v_booking.normalized_guest_email is not null then
    perform pg_advisory_xact_lock(hashtextextended('customer:'||v_booking.normalized_guest_email,0));
  end if;
  if v_booking.customer_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('customer-id:'||v_booking.customer_id::text,0));
  end if;

  if exists(
    select 1 from public.bookings b
    where b.id<>v_booking.id and b.booking_resource_id=v_booking.booking_resource_id
      and b.is_active_booking
      and b.booking_window&&tstzrange(v_option.appointment_datetime,v_blocked_until,'[)')
  ) or exists(
    select 1 from public.booking_checkout_intents i
    where i.is_pending_intent and i.expires_at>now()
      and i.booking_resource_id=v_booking.booking_resource_id
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
    blocked_until=v_blocked_until,
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
revoke all on function public.respond_booking_reschedule(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.respond_booking_reschedule(uuid,uuid,text) to service_role;

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
)
values
('booking.guest_link_expiry_hours','booking_availability','Guest manage-link lifetime','Hours before a newly issued secure guest booking link expires.','number','168','168','Published','security','{"min":1,"max":720}','Sensitive actions rotate the link immediately.','Affects future guest manage links.',false,false,70,array['Booking confirmation','Guest booking management']),
('booking.guest_cancellation_cutoff_hours','booking_availability','Guest cancellation cutoff','Minimum hours before an appointment when a guest may self-cancel.','number','24','24','Published','booking','{"min":0,"max":336}','The reservation deposit remains subject to the accepted policy.','Affects future guest cancellation attempts.',true,false,80,array['Guest booking management']),
('booking.reschedule_proposal_expiry_hours','booking_availability','Reschedule proposal lifetime','Hours a customer has to accept or decline a salon reschedule proposal.','number','72','72','Published','booking','{"min":1,"max":336}','Expired proposals never change a booking.','Affects future reschedule proposals.',true,false,90,array['Salon bookings','Guest booking management'])
on conflict(setting_key) do nothing;

commit;
