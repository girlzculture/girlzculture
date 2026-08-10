begin;

alter table if exists public.support_tickets
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz;

create index if not exists support_tickets_assignment_queue_idx
  on public.support_tickets (assigned_to, priority, status, created_at desc);

comment on column public.support_tickets.assigned_to is
  'Active platform administrator responsible for the retained support or complaint ticket.';
comment on column public.support_tickets.assigned_at is
  'Timestamp of the most recent explicit administrator assignment.';

-- Assignment and its immutable management event are one database statement.
-- A failed audit insert therefore rolls the ticket update back instead of
-- returning an error after the new owner or priority has already persisted.
create or replace function public.admin_assign_support_ticket(
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_assigned_to uuid,
  p_priority text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before public.support_tickets%rowtype;
  v_after public.support_tickets%rowtype;
  v_permission text;
  v_assignee_user_id uuid;
begin
  if p_priority not in ('Low', 'Normal', 'High', 'Urgent') then
    raise exception 'Choose a valid support priority.' using errcode='22023';
  end if;

  select * into v_before
  from public.support_tickets ticket
  where ticket.id = p_ticket_id
  for update;
  if not found then
    raise exception 'Support request not found.' using errcode='P0002';
  end if;

  v_permission := case
    when v_before.complaint_id is not null
      or lower(trim(coalesce(v_before.category, ''))) = 'complaint'
      then 'complaints'
    else 'support'
  end;

  if not exists (
    select 1
    from public.admin_users actor
    where coalesce(actor.user_id, actor.id) = p_actor_user_id
      and actor.status = 'Active'
      and (
        coalesce(actor.is_super_admin, false)
        or coalesce((actor.permissions ->> v_permission)::boolean, false)
      )
  ) then
    raise exception 'Forbidden: this admin role does not have access to this section.'
      using errcode='42501';
  end if;

  if p_assigned_to is not null then
    select coalesce(assignee.user_id, assignee.id)
    into v_assignee_user_id
    from public.admin_users assignee
    where coalesce(assignee.user_id, assignee.id) = p_assigned_to
      and assignee.status = 'Active'
      and (
        coalesce(assignee.is_super_admin, false)
        or coalesce((assignee.permissions ->> v_permission)::boolean, false)
      )
    limit 1;
    if v_assignee_user_id is null then
      raise exception 'Choose an active administrator with access to this queue.'
        using errcode='22023';
    end if;
  end if;

  update public.support_tickets ticket
  set assigned_to = v_assignee_user_id,
      assigned_at = case
        when v_assignee_user_id is null then null
        when v_before.assigned_to is not distinct from v_assignee_user_id
          then coalesce(v_before.assigned_at, now())
        else now()
      end,
      priority = p_priority,
      updated_at = now()
  where ticket.id = p_ticket_id
  returning * into v_after;

  insert into public.record_management_events(
    record_type,
    record_id,
    record_label,
    action,
    dependency_summary,
    before_values,
    after_values,
    reason,
    acting_user_id,
    acting_scope
  ) values (
    'support_ticket',
    p_ticket_id::text,
    v_before.subject,
    'Updated',
    jsonb_build_object(
      'complaint_id', v_before.complaint_id,
      'permission', v_permission
    ),
    to_jsonb(v_before),
    to_jsonb(v_after),
    'Administrator assignment or priority updated',
    p_actor_user_id,
    'platform_admin'
  );

  return jsonb_build_object(
    'ticket', to_jsonb(v_after),
    'permission', v_permission,
    'assignee_user_id', v_assignee_user_id
  );
end;
$$;

comment on function public.admin_assign_support_ticket(uuid,uuid,uuid,text) is
  'Atomically updates support ownership/priority and records the administrator audit event.';
revoke all on function public.admin_assign_support_ticket(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_assign_support_ticket(uuid,uuid,uuid,text)
  to service_role;

-- A durable, idempotent delivery record is written in the same transaction as
-- the response. Provider delivery happens after commit and can be retried
-- without applying the response, complaint status, or audit rows twice.
create table if not exists public.support_response_email_outbox (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  idempotency_key text not null unique,
  actor_user_id uuid references auth.users(id) on delete set null,
  recipient_name text,
  recipient_email text,
  subject text not null,
  response_text text not null,
  delivery_status text not null default 'Pending'
    check (delivery_status in ('Pending','Processing','Sent','Failed','NotRequired')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_response_email_outbox_delivery_idx
  on public.support_response_email_outbox(delivery_status,created_at)
  where delivery_status in ('Pending','Processing','Failed');
alter table public.support_response_email_outbox enable row level security;
revoke all on table public.support_response_email_outbox
  from public, anon, authenticated;
grant select,insert,update,delete on table public.support_response_email_outbox
  to service_role;

create or replace function public.admin_respond_support_ticket(
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_response text,
  p_status text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before public.support_tickets%rowtype;
  v_after public.support_tickets%rowtype;
  v_complaint_before public.complaints_log%rowtype;
  v_complaint_after public.complaints_log%rowtype;
  v_outbox public.support_response_email_outbox%rowtype;
  v_permission text;
begin
  if nullif(trim(coalesce(p_response,'')),'') is null
    or length(p_response)>5000 then
    raise exception 'Write a response before sending.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_status,'')),'') is null
    or length(p_status)>80 then
    raise exception 'Choose an approved support status.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null
    or length(p_idempotency_key)>160 then
    raise exception 'A response request key is required.' using errcode='22023';
  end if;

  select * into v_before
  from public.support_tickets ticket
  where ticket.id=p_ticket_id
  for update;
  if not found then
    raise exception 'Support request not found.' using errcode='P0002';
  end if;
  v_permission := case
    when v_before.complaint_id is not null
      or lower(trim(coalesce(v_before.category,'')))='complaint'
      then 'complaints'
    else 'support'
  end;
  if not exists (
    select 1 from public.admin_users actor
    where coalesce(actor.user_id,actor.id)=p_actor_user_id
      and actor.status='Active'
      and (
        coalesce(actor.is_super_admin,false)
        or coalesce((actor.permissions->>v_permission)::boolean,false)
      )
  ) then
    raise exception 'Forbidden: this admin role does not have access to this section.'
      using errcode='42501';
  end if;

  select * into v_outbox
  from public.support_response_email_outbox outbox
  where outbox.idempotency_key=p_idempotency_key;
  if found then
    if v_outbox.ticket_id<>p_ticket_id then
      raise exception 'That response request key is already in use.' using errcode='22023';
    end if;
    return jsonb_build_object(
      'ticket',to_jsonb(v_before),
      'outbox',to_jsonb(v_outbox),
      'replayed',true
    );
  end if;

  update public.support_tickets ticket set
    admin_response=p_response,
    status=p_status,
    responded_at=clock_timestamp(),
    responded_by=p_actor_user_id,
    updated_at=clock_timestamp()
  where ticket.id=p_ticket_id
  returning * into v_after;

  if v_before.complaint_id is not null then
    select * into v_complaint_before
    from public.complaints_log complaint
    where complaint.id=v_before.complaint_id
    for update;
    if found then
      update public.complaints_log complaint
      set status=p_status
      where complaint.id=v_before.complaint_id
      returning * into v_complaint_after;
      insert into public.record_management_events(
        record_type,record_id,record_label,action,dependency_summary,
        before_values,after_values,reason,acting_user_id,acting_scope
      ) values (
        'complaint',v_complaint_after.id::text,
        coalesce(v_complaint_after.category,v_complaint_after.type,'Complaint'),
        'Updated',jsonb_build_object('support_ticket_id',p_ticket_id),
        to_jsonb(v_complaint_before),to_jsonb(v_complaint_after),
        'Status synchronized from administrator support response',
        p_actor_user_id,'platform_admin'
      );
    end if;
  end if;

  insert into public.record_management_events(
    record_type,record_id,record_label,action,dependency_summary,
    before_values,after_values,reason,acting_user_id,acting_scope
  ) values (
    'support_ticket',p_ticket_id::text,v_before.subject,'Updated',
    jsonb_build_object(
      'complaint_id',v_before.complaint_id,
      'permission',v_permission,
      'idempotency_key',p_idempotency_key
    ),
    to_jsonb(v_before),to_jsonb(v_after),
    'Administrator support response saved',p_actor_user_id,'platform_admin'
  );

  insert into public.support_response_email_outbox(
    ticket_id,idempotency_key,actor_user_id,recipient_name,recipient_email,
    subject,response_text,delivery_status
  ) values (
    p_ticket_id,p_idempotency_key,p_actor_user_id,v_before.requester_name,
    nullif(trim(coalesce(v_before.requester_email,'')),''),
    'Re: '||v_before.subject,p_response,
    case
      when nullif(trim(coalesce(v_before.requester_email,'')),'') is null
        then 'NotRequired'
      else 'Pending'
    end
  ) returning * into v_outbox;

  return jsonb_build_object(
    'ticket',to_jsonb(v_after),
    'outbox',to_jsonb(v_outbox),
    'replayed',false
  );
end;
$$;

create or replace function public.admin_claim_support_response_email(
  p_outbox_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare claimed public.support_response_email_outbox%rowtype;
begin
  if not exists (
    select 1 from public.admin_users actor
    where coalesce(actor.user_id,actor.id)=p_actor_user_id
      and actor.status='Active'
      and (
        coalesce(actor.is_super_admin,false)
        or coalesce((actor.permissions->>'support')::boolean,false)
        or coalesce((actor.permissions->>'complaints')::boolean,false)
      )
  ) then
    raise exception 'Forbidden: this admin role does not have access to this section.'
      using errcode='42501';
  end if;
  update public.support_response_email_outbox outbox set
    delivery_status='Processing',
    attempt_count=outbox.attempt_count+1,
    claimed_at=clock_timestamp(),
    updated_at=clock_timestamp(),
    last_error_code=null
  where outbox.id=p_outbox_id
    and (
      outbox.delivery_status in ('Pending','Failed')
      or (
        outbox.delivery_status='Processing'
        and outbox.claimed_at<now()-interval '5 minutes'
      )
    )
  returning * into claimed;
  return case when claimed.id is null then null else to_jsonb(claimed) end;
end;
$$;

create or replace function public.admin_complete_support_response_email(
  p_outbox_id uuid,
  p_actor_user_id uuid,
  p_delivery_status text,
  p_provider_message_id text default null,
  p_error_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare completed public.support_response_email_outbox%rowtype;
begin
  if p_delivery_status not in ('Sent','Failed') then
    raise exception 'Choose a valid delivery result.' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.admin_users actor
    where coalesce(actor.user_id,actor.id)=p_actor_user_id
      and actor.status='Active'
      and (
        coalesce(actor.is_super_admin,false)
        or coalesce((actor.permissions->>'support')::boolean,false)
        or coalesce((actor.permissions->>'complaints')::boolean,false)
      )
  ) then
    raise exception 'Forbidden: this admin role does not have access to this section.'
      using errcode='42501';
  end if;
  update public.support_response_email_outbox outbox set
    delivery_status=p_delivery_status,
    provider_message_id=case
      when p_delivery_status='Sent' then left(p_provider_message_id,200)
      else null
    end,
    last_error_code=case
      when p_delivery_status='Failed' then left(p_error_code,120)
      else null
    end,
    sent_at=case when p_delivery_status='Sent' then clock_timestamp() else null end,
    updated_at=clock_timestamp()
  where outbox.id=p_outbox_id and outbox.delivery_status='Processing'
  returning * into completed;
  return case when completed.id is null then null else to_jsonb(completed) end;
end;
$$;

comment on function public.admin_respond_support_ticket(uuid,uuid,text,text,text) is
  'Atomically saves a support response, synchronizes a linked complaint, audits both, and enqueues one idempotent email.';
revoke all on function public.admin_respond_support_ticket(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.admin_claim_support_response_email(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.admin_complete_support_response_email(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_respond_support_ticket(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.admin_claim_support_response_email(uuid,uuid)
  to service_role;
grant execute on function public.admin_complete_support_response_email(uuid,uuid,text,text,text)
  to service_role;

update public.engine_settings
set published_value='"20260809120000"'::jsonb,
    draft_value='"20260809120000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';

commit;
