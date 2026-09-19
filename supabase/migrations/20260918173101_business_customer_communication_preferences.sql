begin;
create table public.business_communication_preferences(
 id uuid primary key default gen_random_uuid(),salon_id uuid not null references public.salons(id) on delete cascade,
 customer_id uuid references auth.users(id) on delete cascade,guest_booking_id uuid references public.bookings(id) on delete cascade,
 email_enabled boolean not null default true,sms_enabled boolean not null default true,push_enabled boolean not null default true,
 reminders boolean not null default true,follow_up boolean not null default false,marketing boolean not null default false,
 locale text not null default 'en' check(locale in('en','fr','es','zh-CN')),revision integer not null default 1 check(revision>0),
 consent_version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(num_nonnulls(customer_id,guest_booking_id)=1)
);
create unique index business_communication_customer on public.business_communication_preferences(salon_id,customer_id) where customer_id is not null;
create unique index business_communication_guest on public.business_communication_preferences(guest_booking_id) where guest_booking_id is not null;
create table public.business_communication_preference_history(
 id uuid primary key default gen_random_uuid(),preference_id uuid not null references public.business_communication_preferences(id) on delete cascade,
 revision integer not null,request_id uuid not null,actor_id uuid,guest_token_id uuid,action text not null check(action in('customer_saved','unsubscribed')),
 choices jsonb not null,created_at timestamptz not null default now(),unique(preference_id,request_id)
);
alter table public.business_communication_preferences enable row level security;
alter table public.business_communication_preference_history enable row level security;
revoke all on public.business_communication_preferences,public.business_communication_preference_history from public,anon,authenticated;
grant all on public.business_communication_preferences,public.business_communication_preference_history to service_role;

create function public.manage_business_communication_preferences(p_booking uuid,p_customer uuid,p_guest_token uuid,p_update jsonb default null,p_expected integer default null,p_request uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype;pref public.business_communication_preferences%rowtype;prior public.business_communication_preference_history%rowtype;subject_customer uuid;subject_booking uuid;result jsonb;choices jsonb;
begin
 select * into b from public.bookings where id=p_booking for update;
 if not found then raise exception 'COMMUNICATION_FORBIDDEN';end if;
 if p_guest_token is not null then
  if not exists(select from public.booking_guest_access_tokens where id=p_guest_token and booking_id=b.id and purpose='manage' and revoked_at is null and expires_at>now()) then raise exception 'COMMUNICATION_FORBIDDEN';end if;
  subject_booking:=b.id;
 elsif p_customer is not null and b.customer_id=p_customer and exists(select from public.platform_identities where user_id=p_customer and primary_role='customer' and status='Active') then subject_customer:=p_customer;
 else raise exception 'COMMUNICATION_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('communication-preferences:'||b.salon_id||':'||coalesce(subject_customer,subject_booking),0));
 select * into pref from public.business_communication_preferences where salon_id=b.salon_id and (customer_id=subject_customer or guest_booking_id=subject_booking) for update;
 if p_update is not null then
  if jsonb_typeof(p_update)<>'object' or p_request is null or p_expected is null or p_expected<0
   or (select count(*) from jsonb_object_keys(p_update))<>8
   or not p_update ?& array['email_enabled','sms_enabled','push_enabled','reminders','follow_up','marketing','locale','consent_version']
   or exists(select from jsonb_each(p_update) where key in('email_enabled','sms_enabled','push_enabled','reminders','follow_up','marketing') and jsonb_typeof(value)<>'boolean')
   or jsonb_typeof(p_update->'locale') is distinct from 'string' or p_update->>'locale' not in('en','fr','es','zh-CN') or p_update->'consent_version' is distinct from '1'::jsonb then raise exception 'COMMUNICATION_INVALID';end if;
  choices:=p_update;
  if pref.id is not null then
   select * into prior from public.business_communication_preference_history where preference_id=pref.id and request_id=p_request;
   if found then
    if prior.choices is distinct from choices then raise exception 'COMMUNICATION_REQUEST_REUSED';end if;
   else
    if pref.revision<>p_expected then raise exception 'COMMUNICATION_STALE';end if;
    update public.business_communication_preferences set email_enabled=(choices->>'email_enabled')::boolean,sms_enabled=(choices->>'sms_enabled')::boolean,push_enabled=(choices->>'push_enabled')::boolean,reminders=(choices->>'reminders')::boolean,follow_up=(choices->>'follow_up')::boolean,marketing=(choices->>'marketing')::boolean,locale=choices->>'locale',revision=revision+1,updated_at=now() where id=pref.id returning * into pref;
   end if;
  else
   if p_expected<>0 then raise exception 'COMMUNICATION_STALE';end if;
   insert into public.business_communication_preferences(salon_id,customer_id,guest_booking_id,email_enabled,sms_enabled,push_enabled,reminders,follow_up,marketing,locale)
   values(b.salon_id,subject_customer,subject_booking,(choices->>'email_enabled')::boolean,(choices->>'sms_enabled')::boolean,(choices->>'push_enabled')::boolean,(choices->>'reminders')::boolean,(choices->>'follow_up')::boolean,(choices->>'marketing')::boolean,choices->>'locale') returning * into pref;
  end if;
  if prior.id is null then insert into public.business_communication_preference_history(preference_id,revision,request_id,actor_id,guest_token_id,action,choices) values(pref.id,pref.revision,p_request,subject_customer,p_guest_token,'customer_saved',choices);end if;
 end if;
 result:=jsonb_build_object('scope',case when subject_customer is not null then 'business' else 'booking' end,'revision',coalesce(pref.revision,0),'email_enabled',coalesce(pref.email_enabled,true),'sms_enabled',coalesce(pref.sms_enabled,true),'push_enabled',coalesce(pref.push_enabled,true),'reminders',coalesce(pref.reminders,true),'follow_up',coalesce(pref.follow_up,false),'marketing',coalesce(pref.marketing,false),'locale',coalesce(pref.locale,case when b.preferred_locale in('en','fr','es','zh-CN') then b.preferred_locale else 'en' end),'consent_version',1);
 return result;
end $$;
revoke all on function public.manage_business_communication_preferences(uuid,uuid,uuid,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.manage_business_communication_preferences(uuid,uuid,uuid,jsonb,integer,uuid) to service_role;

create function public.unsubscribe_business_communications(p_preference uuid,p_request uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare pref public.business_communication_preferences%rowtype;
begin
 select * into pref from public.business_communication_preferences where id=p_preference for update;
 if not found then return;end if;
 if not pref.marketing and not pref.follow_up then return;end if;
 update public.business_communication_preferences set marketing=false,follow_up=false,revision=revision+1,updated_at=now() where id=p_preference returning * into pref;
 insert into public.business_communication_preference_history(preference_id,revision,request_id,action,choices) values(pref.id,pref.revision,p_request,'unsubscribed','{"marketing":false,"follow_up":false}');
end $$;
revoke all on function public.unsubscribe_business_communications(uuid,uuid) from public,anon,authenticated;
grant execute on function public.unsubscribe_business_communications(uuid,uuid) to service_role;

-- Enforce the latest customer choices before a channel is reserved, including
-- older callers. Business users cannot bypass opt-out by choosing a send path.
alter table public.notification_delivery_log drop constraint notification_delivery_log_event_type_check;
alter table public.notification_delivery_log add constraint notification_delivery_log_event_type_check check (
 event_type in('booking_confirmed','booking_cancelled','booking_follow_up')
 or event_type ~ '^booking_reminder_[0-9]+h$'
 or event_type ~ '^(booking_message|reschedule_proposal|reschedule_accepted|business_campaign):[0-9a-f-]{36}$'
);
alter function public.claim_notification_delivery(uuid,text,text,text,text,text) rename to claim_notification_delivery_without_preferences;
revoke all on function public.claim_notification_delivery_without_preferences(uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
create function public.claim_notification_delivery(p_booking_id uuid,p_event_type text,p_recipient_type text,p_channel text,p_destination text,p_deduplication_key text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype;pref public.business_communication_preferences%rowtype;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then return null;end if;
 if p_recipient_type='customer' then
  select * into pref from public.business_communication_preferences where salon_id=b.salon_id and (guest_booking_id=b.id or customer_id=b.customer_id) order by (guest_booking_id is not null) desc limit 1 for share;
  if p_channel='email' and not coalesce(pref.email_enabled,true) or p_channel='sms' and not coalesce(pref.sms_enabled,true) or p_channel='push' and not coalesce(pref.push_enabled,true) then return null;end if;
  if p_event_type like 'booking_reminder_%' and (not coalesce(pref.reminders,true) or b.status<>'Confirmed') then return null;end if;
  if p_event_type='booking_follow_up' and (not coalesce(pref.follow_up,false) or b.status<>'Completed' or b.duration_hours is null or b.duration_hours<=0 or b.appointment_datetime+make_interval(secs=>(b.duration_hours*3600)::integer)>now()) then return null;end if;
  if p_event_type like 'business_campaign:%' and not coalesce(pref.marketing,false) then return null;end if;
 end if;
 return public.claim_notification_delivery_without_preferences(p_booking_id,p_event_type,p_recipient_type,p_channel,p_destination,p_deduplication_key);
end $$;
revoke all on function public.claim_notification_delivery(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_notification_delivery(uuid,text,text,text,text,text) to service_role;
update public.engine_settings set published_value='"20260918173101"'::jsonb,draft_value='"20260918173101"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
