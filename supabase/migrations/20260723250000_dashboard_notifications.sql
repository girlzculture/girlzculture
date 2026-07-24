begin;

alter table public.notifications
  add column if not exists recipient_role text,
  add column if not exists category text not null default 'general',
  add column if not exists severity text not null default 'info',
  add column if not exists dedupe_key text,
  add column if not exists occurrence_count integer not null default 1,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notifications
  drop constraint if exists notifications_recipient_role_check;
alter table public.notifications
  add constraint notifications_recipient_role_check
  check(recipient_role is null or recipient_role in ('customer','salon','admin'));
alter table public.notifications
  drop constraint if exists notifications_category_check;
alter table public.notifications
  add constraint notifications_category_check
  check(category in ('general','bookings','messages','errors','payments','support','lifecycle'));
alter table public.notifications
  drop constraint if exists notifications_severity_check;
alter table public.notifications
  add constraint notifications_severity_check
  check(severity in ('info','success','warning','high','critical'));
alter table public.notifications
  drop constraint if exists notifications_occurrence_count_check;
alter table public.notifications
  add constraint notifications_occurrence_count_check check(occurrence_count between 1 and 1000000);

update public.notifications notification
set recipient_role='salon',category=case
  when lower(title) like '%message%' then 'messages'
  when lower(title) like '%payment%' or lower(title) like '%refund%' or lower(title) like '%payout%' then 'payments'
  else 'bookings' end
where recipient_role is null
  and exists(
    select 1 from public.salons salon
    where salon.id=notification.salon_id and salon.user_id=notification.user_id
  );

create index if not exists notifications_user_unread_category_idx
  on public.notifications(user_id,recipient_role,category,read_at,created_at desc);
create index if not exists notifications_salon_role_unread_idx
  on public.notifications(salon_id,recipient_role,read_at,created_at desc);

create or replace function public.upsert_dashboard_notification(
  p_user_id uuid,
  p_salon_id uuid,
  p_booking_id uuid,
  p_recipient_role text,
  p_category text,
  p_severity text,
  p_title text,
  p_body text,
  p_action_url text,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if p_recipient_role not in ('customer','salon','admin')
    or p_category not in ('general','bookings','messages','errors','payments','support','lifecycle')
    or p_severity not in ('info','success','warning','high','critical') then
    raise exception 'Invalid dashboard notification classification.';
  end if;
  if coalesce(p_dedupe_key,'')<>'' then
    select id into v_id
    from public.notifications
    where user_id is not distinct from p_user_id
      and salon_id is not distinct from p_salon_id
      and recipient_role=p_recipient_role
      and dedupe_key=left(p_dedupe_key,200)
      and read_at is null
    order by last_seen_at desc
    limit 1
    for update;
  end if;
  if v_id is not null then
    update public.notifications set
      title=left(p_title,240),
      body=left(p_body,2000),
      action_url=left(p_action_url,500),
      severity=p_severity,
      occurrence_count=least(occurrence_count+1,1000000),
      last_seen_at=now(),
      metadata=coalesce(p_metadata,'{}'::jsonb),
      delivery_status='delivered'
    where id=v_id;
    return v_id;
  end if;
  insert into public.notifications(
    user_id,salon_id,booking_id,recipient_role,category,severity,title,body,
    action_url,dedupe_key,metadata,delivery_status
  ) values(
    p_user_id,p_salon_id,p_booking_id,p_recipient_role,p_category,p_severity,
    left(p_title,240),left(p_body,2000),left(p_action_url,500),
    nullif(left(p_dedupe_key,200),''),coalesce(p_metadata,'{}'::jsonb),'delivered'
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.upsert_dashboard_notification(
  uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.upsert_dashboard_notification(
  uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb
) to service_role;

create or replace function public.create_booking_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_owner uuid;
  v_zone text;
  v_service text;
  v_stylist text;
  v_stylist_user uuid;
  v_local_time text;
  v_member record;
begin
  select user_id,coalesce(time_zone,'America/New_York')
    into v_owner,v_zone from public.salons where id=new.salon_id;
  select name into v_service from public.styles where id=new.style_id;
  select stylist.name,coalesce(stylist.user_id,member.user_id)
    into v_stylist,v_stylist_user
  from public.stylists stylist
  left join public.salon_team_members member
    on member.stylist_id=stylist.id and member.status='Active'
  where stylist.id=new.stylist_id limit 1;
  v_local_time:=to_char(
    new.appointment_datetime at time zone v_zone,
    'Mon DD, YYYY at HH12:MI AM'
  );
  perform public.upsert_dashboard_notification(
    v_owner,new.salon_id,new.id,'salon','bookings','success',
    'New confirmed booking',
    coalesce(new.guest_name,'Customer')||' booked '||
      coalesce(v_service,'a service')||' for '||v_local_time||
      case when v_stylist is not null then ' with '||v_stylist else '' end,
    '/salon/dashboard/bookings?booking='||new.id,
    'booking:new:'||new.id||':owner',jsonb_build_object('booking_id',new.id)
  );
  if v_stylist_user is not null and v_stylist_user is distinct from v_owner then
    perform public.upsert_dashboard_notification(
      v_stylist_user,new.salon_id,new.id,'salon','bookings','success',
      'New appointment assigned to you',
      coalesce(new.guest_name,'Customer')||' booked '||
        coalesce(v_service,'a service')||' for '||v_local_time,
      '/salon/dashboard/bookings?booking='||new.id,
      'booking:new:'||new.id||':stylist:'||v_stylist_user,
      jsonb_build_object('booking_id',new.id)
    );
  end if;
  for v_member in
    select user_id from public.salon_team_members
    where salon_id=new.salon_id and status='Active' and user_id is not null
      and coalesce((permissions->>'bookings')::boolean,false)
      and user_id is distinct from v_owner
      and user_id is distinct from v_stylist_user
  loop
    perform public.upsert_dashboard_notification(
      v_member.user_id,new.salon_id,new.id,'salon','bookings','success',
      'New confirmed booking',
      coalesce(new.guest_name,'Customer')||' booked '||
        coalesce(v_service,'a service')||' for '||v_local_time,
      '/salon/dashboard/bookings?booking='||new.id,
      'booking:new:'||new.id||':team:'||v_member.user_id,
      jsonb_build_object('booking_id',new.id)
    );
  end loop;
  if new.customer_id is not null then
    perform public.upsert_dashboard_notification(
      new.customer_id,new.salon_id,new.id,'customer','bookings','success',
      'Appointment confirmed',
      coalesce(v_service,'Your service')||' is confirmed for '||v_local_time,
      '/account?tab=upcoming','booking:new:'||new.id||':customer',
      jsonb_build_object('booking_id',new.id)
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_active_admins(
  p_category text,
  p_severity text,
  p_title text,
  p_body text,
  p_action_url text,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_admin record;
begin
  for v_admin in
    select user_id from public.admin_users
    where user_id is not null and lower(coalesce(status,'active'))='active'
  loop
    perform public.upsert_dashboard_notification(
      v_admin.user_id,null,null,'admin',p_category,p_severity,p_title,p_body,
      p_action_url,p_dedupe_key,p_metadata
    );
  end loop;
end;
$$;
revoke all on function public.notify_active_admins(text,text,text,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.notify_active_admins(text,text,text,text,text,text,jsonb)
  to service_role;

create or replace function public.dashboard_notify_support_ticket()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.notify_active_admins(
    'support',case when new.priority='High' then 'high' else 'info' end,
    'New support request',coalesce(new.subject,'A customer needs assistance.'),
    '/admin/support?ticket='||new.id,'support:'||new.id,
    jsonb_build_object('ticket_id',new.id,'category',new.category)
  );
  return new;
end;
$$;
drop trigger if exists dashboard_notify_support_ticket on public.support_tickets;
create trigger dashboard_notify_support_ticket after insert on public.support_tickets
for each row execute function public.dashboard_notify_support_ticket();

create or replace function public.dashboard_notify_application()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    perform public.notify_active_admins(
      'lifecycle','info','New salon application',
      coalesce(new.business_name,'A salon')||' submitted an application.',
      '/admin/submissions/'||new.id,'application:new:'||new.id,
      jsonb_build_object('application_id',new.id,'salon_id',new.salon_id,'state',new.state)
    );
    perform public.upsert_dashboard_notification(
      new.user_id,new.salon_id,null,'salon','lifecycle','success',
      'Application received','Your salon application was submitted for review.',
      '/salon/application-submitted','application:submitted:'||new.id,
      jsonb_build_object('application_id',new.id)
    );
  elsif new.status is distinct from old.status then
    perform public.upsert_dashboard_notification(
      new.user_id,new.salon_id,null,'salon','lifecycle',
      case when new.status in ('Approved','Active') then 'success' when new.status='Rejected' then 'warning' else 'info' end,
      'Application status updated','Your salon application is now '||lower(new.status)||'.',
      '/salon/dashboard','application:status:'||new.id||':'||new.status,
      jsonb_build_object('application_id',new.id,'status',new.status)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists dashboard_notify_application on public.salon_applications;
create trigger dashboard_notify_application after insert or update of status on public.salon_applications
for each row execute function public.dashboard_notify_application();

create or replace function public.dashboard_notify_platform_error()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.severity in ('critical','high') and new.status in ('Open','Investigating') then
    perform public.notify_active_admins(
      'errors',new.severity,
      case when new.severity='critical' then 'Critical platform issue' else 'Platform issue needs attention' end,
      coalesce(new.user_safe_message,'An operational issue needs administrator review.'),
      '/admin/engine?category=operational_monitoring&event='||new.id,
      'platform-error:'||new.id,
      jsonb_build_object('event_id',new.id,'feature',new.feature,'route',new.route)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists dashboard_notify_platform_error on public.platform_error_events;
create trigger dashboard_notify_platform_error
after insert or update of occurrence_count,severity,status on public.platform_error_events
for each row execute function public.dashboard_notify_platform_error();

create or replace function public.dashboard_notify_billing_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.salons where id=new.salon_id;
  if v_owner is not null then
    perform public.upsert_dashboard_notification(
      v_owner,new.salon_id,null,'salon','payments',
      case when lower(coalesce(new.payment_status,'')) in ('paid','succeeded') then 'success' else 'warning' end,
      'Subscription payment update',
      coalesce(new.event_type,'A billing event')||' was recorded for your salon.',
      '/salon/dashboard/subscription','billing:'||new.stripe_event_id,
      jsonb_build_object('billing_event_id',new.id,'event_type',new.event_type)
    );
  end if;
  perform public.notify_active_admins(
    'payments','info','Subscription payment update',
    coalesce(new.salon_name,'A salon')||': '||coalesce(new.event_type,'billing event'),
    '/admin/finance','billing:'||new.stripe_event_id,
    jsonb_build_object('billing_event_id',new.id,'salon_id',new.salon_id)
  );
  return new;
end;
$$;
drop trigger if exists dashboard_notify_billing_event on public.billing_events;
create trigger dashboard_notify_billing_event after insert on public.billing_events
for each row execute function public.dashboard_notify_billing_event();

commit;
