begin;

create table if not exists public.engine_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique check(setting_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  category text not null,
  display_name text not null,
  description text not null default '',
  value_type text not null check(value_type in ('text','rich_text','number','percentage','currency','boolean','color','list','reorderable_list','media','template','schedule','relationship')),
  draft_value jsonb,
  published_value jsonb,
  status text not null default 'Draft' check(status in ('Draft','Published')),
  version integer not null default 1 check(version > 0),
  published_version integer not null default 0 check(published_version >= 0),
  impact_level text not null default 'standard' check(impact_level in ('standard','customer','booking','billing','security','safety','legal')),
  validation jsonb not null default '{}'::jsonb,
  help_text text not null default '',
  impact_description text not null default '',
  is_public boolean not null default false,
  is_secret_status boolean not null default false,
  environment text not null default 'all' check(environment in ('all','development','preview','production')),
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  published_at timestamptz
);

create table if not exists public.engine_setting_versions (
  id uuid primary key default gen_random_uuid(),
  setting_id uuid not null references public.engine_settings(id) on delete cascade,
  version integer not null,
  action text not null check(action in ('Draft saved','Published','Rolled back')),
  value jsonb,
  previous_value jsonb,
  reason text,
  environment text not null default 'all',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(setting_id,version)
);

create table if not exists public.engine_publication_state (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 1,
  last_published_at timestamptz,
  last_published_by uuid references auth.users(id)
);
insert into public.engine_publication_state(singleton) values(true) on conflict(singleton) do nothing;

create index if not exists engine_settings_category_sort_idx on public.engine_settings(category,sort_order,display_name);
create index if not exists engine_setting_versions_setting_created_idx on public.engine_setting_versions(setting_id,created_at desc);

alter table public.engine_settings enable row level security;
alter table public.engine_setting_versions enable row level security;
alter table public.engine_publication_state enable row level security;
drop policy if exists engine_settings_published_public_read on public.engine_settings;
drop policy if exists engine_settings_admin_manage on public.engine_settings;
drop policy if exists engine_versions_admin_read on public.engine_setting_versions;
drop policy if exists engine_versions_admin_write on public.engine_setting_versions;
drop policy if exists engine_publication_state_read on public.engine_publication_state;
drop policy if exists engine_publication_state_admin_write on public.engine_publication_state;
create policy engine_settings_published_public_read on public.engine_settings for select using((is_public and status='Published') or public.admin_has_permission('settings'));
create policy engine_settings_admin_manage on public.engine_settings for all to authenticated using(public.admin_has_permission('settings')) with check(public.admin_has_permission('settings'));
create policy engine_versions_admin_read on public.engine_setting_versions for select to authenticated using(public.admin_has_permission('settings'));
create policy engine_versions_admin_write on public.engine_setting_versions for insert to authenticated with check(public.admin_has_permission('settings'));
create policy engine_publication_state_read on public.engine_publication_state for select using(true);
create policy engine_publication_state_admin_write on public.engine_publication_state for update to authenticated using(public.admin_has_permission('settings')) with check(public.admin_has_permission('settings'));

insert into public.engine_settings(setting_key,category,display_name,description,value_type,draft_value,published_value,status,impact_level,validation,help_text,impact_description,is_public,is_secret_status,sort_order) values
('branding.primary_color','general_branding','Primary brand color','Primary plum used for headings and brand surfaces.','color','"#5B1A6B"','"#5B1A6B"','Published','customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Use a six-digit hexadecimal color.','Changes brand presentation across public surfaces.',true,false,10),
('branding.cta_color','general_branding','Call-to-action color','Magenta used for primary buttons and active states.','color','"#D6186B"','"#D6186B"','Published','customer','{"pattern":"^#[0-9A-Fa-f]{6}$"}','Maintain sufficient contrast with white text.','Changes primary actions across the platform.',true,false,20),
('identity.admin_mfa_policy','identity_security','Admin verification policy','How often platform administrators complete email verification.','text','"new_device"','"new_device"','Published','security','{"allowed":["every_login","new_device"]}','Secrets and signing credentials remain in deployment configuration.','Affects platform-admin access security.',false,false,10),
('salon.activation_mode','salon_activation','Salon activation mode','Controls whether eligible approved salons activate automatically.','text','"automatic"','"automatic"','Published','safety','{"allowed":["automatic","manual"]}','Detailed setup gates are managed in the lifecycle editor below.','Affects when salons become visible to customers.',false,false,10),
('booking.default_buffer_minutes','booking_rules','Default booking buffer','Default cleanup time between services when a salon has not chosen one.','number','15','15','Published','booking','{"min":0,"max":180,"integer":true}','Measured in minutes.','Affects future availability calculations.',true,false,10),
('booking.deposit_percentage','payments_plans','Reservation deposit percentage','Percentage of the verified booking total collected to reserve an appointment.','percentage','10','10','Published','billing','{"min":0,"max":100}','Publishing requires explicit billing confirmation. Existing paid bookings never change.','Affects future booking deposits and balances.',true,false,10),
('catalog.default_currency','service_catalog','Default display currency','Currency used when a market does not specify another currency.','text','"USD"','"USD"','Published','billing','{"allowed":["USD"]}','Adding currencies requires payment and tax support first.','Affects future price formatting.',true,false,10),
('search.default_radius_miles','search_language','Default discovery radius','Initial salon-search radius around a confirmed customer location.','number','25','25','Published','customer','{"min":1,"max":250}','Customers can still change supported distance filters.','Affects which nearby salons are considered.',true,false,10),
('location.country_codes','location_markets','Supported countries','Countries currently enabled for structured addresses and discovery.','list','["US"]','["US"]','Published','customer','{"maxItems":20}','Launch additional countries only after address, payments, and legal review.','Affects available market/address choices.',true,false,10),
('homepage.nearby_card_count','homepage_composition','Nearby salon card count','Maximum cards in the homepage nearby row before a customer opens all results.','number','6','6','Published','customer','{"min":1,"max":24,"integer":true}','Section order and visibility remain in Homepage Rows.','Affects homepage layout and query size.',true,false,10),
('content.faq_search_enabled','content_legal','FAQ search','Allow visitors to search Help Center questions.','boolean','true','true','Published','customer','{}','','Affects Help Center interaction.',true,false,10),
('trust.verified_label','trust_badges','Verified salon label','Customer-facing label for salons that passed platform review.','text','"Verified Salon"','"Verified Salon"','Published','safety','{"minLength":2,"maxLength":60}','Badge eligibility remains integrity-protected.','Changes trust copy, not verification state.',true,false,10),
('notifications.booking_reminder_hours','notifications','Booking reminder timing','Hours before an appointment when the standard reminder is scheduled.','reorderable_list','[24,2]','[24,2]','Published','booking','{"maxItems":6}','Delivery channels and provider credentials remain secure.','Affects future reminders.',false,false,10),
('languages.supported','languages','Supported languages','Languages shown in the platform language selector.','reorderable_list','["en","es","fr","wo"]','["en","es","fr","wo"]','Published','customer','{"maxItems":20}','Translation publication is managed below.','Affects available language choices.',true,false,10),
('media.public_image_quality','media','Image output quality','Compression quality for newly generated public image renditions.','percentage','88','88','Published','customer','{"min":60,"max":100}','Existing assets are not recompressed automatically.','Affects future media size and fidelity.',false,false,10),
('quality.cancellation_threshold_percent','quality_support','Cancellation review threshold','Salon-initiated cancellation rate that flags a salon for review.','percentage','10','10','Published','safety','{"min":1,"max":100}','The Quality panel provides detailed operational reporting.','Affects automated quality flags.',false,false,10),
('maintenance.test_data_enabled','test_data','Test-data maintenance tool','Whether super-admin test-batch cleanup tools are available in this environment.','boolean','false','false','Published','security','{}','Production records must carry a durable test marker before cleanup.','Controls access to destructive maintenance tools.',false,false,10),
('security.stripe_status','identity_security','Stripe server configuration','Read-only deployment status. Secret values never enter Engine.','text','{"configured":false}','{"configured":false}','Published','security','{}','Configure secrets in Netlify environment variables.','Status only; no credentials are stored here.',false,true,90),
('publishing.require_reason','configuration_history','Reason required for high-impact publishing','Require administrators to explain billing, booking, security, safety, and legal changes.','boolean','true','true','Published','security','{}','','Strengthens governance and recovery.',false,false,10)
on conflict(setting_key) do nothing;

create or replace function public.engine_number_setting(p_key text, p_fallback numeric)
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce(
    (select case
      when jsonb_typeof(published_value)='number' then (published_value #>> '{}')::numeric
      when jsonb_typeof(published_value)='string' and (published_value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then (published_value #>> '{}')::numeric
      else null end
     from public.engine_settings where setting_key=p_key and status='Published'),
    p_fallback
  )
$$;
revoke all on function public.engine_number_setting(text,numeric) from public;
grant execute on function public.engine_number_setting(text,numeric) to anon,authenticated,service_role;

drop policy if exists bookings_customer_insert on public.bookings;
create policy bookings_customer_insert on public.bookings for insert to authenticated
with check (
  customer_id=auth.uid()
  and deposit_amount=round(estimated_total * (public.engine_number_setting('booking.deposit_percentage',10)/100),2)
  and balance_due=estimated_total-deposit_amount
);

create or replace function public.engine_apply_setting(
  p_setting_key text,
  p_expected_version integer,
  p_action text,
  p_value jsonb,
  p_reason text,
  p_target_version integer,
  p_confirm_high_impact boolean,
  p_actor_user_id uuid,
  p_environment text default 'all'
) returns public.engine_settings
language plpgsql security definer set search_path=public,auth as $$
declare
  v_setting public.engine_settings%rowtype;
  v_history public.engine_setting_versions%rowtype;
  v_next integer;
  v_value jsonb;
  v_previous jsonb;
begin
  select * into v_setting from public.engine_settings where setting_key=p_setting_key for update;
  if not found then raise exception 'SETTING_NOT_FOUND'; end if;
  if v_setting.version<>p_expected_version then raise exception 'SETTING_VERSION_CONFLICT'; end if;
  if v_setting.is_secret_status then raise exception 'SECRET_STATUS_READ_ONLY'; end if;
  if p_action not in ('save_draft','publish','rollback') then raise exception 'INVALID_SETTING_ACTION'; end if;
  if p_action in ('publish','rollback') and v_setting.impact_level in ('booking','billing','security','safety','legal') and (not coalesce(p_confirm_high_impact,false) or length(trim(coalesce(p_reason,'')))<8) then
    raise exception 'HIGH_IMPACT_CONFIRMATION_REQUIRED';
  end if;
  v_next:=v_setting.version+1;
  v_previous:=v_setting.published_value;
  if p_action='rollback' then
    select * into v_history from public.engine_setting_versions where setting_id=v_setting.id and version=p_target_version;
    if not found then raise exception 'SETTING_VERSION_NOT_FOUND'; end if;
    v_value:=v_history.value;
    update public.engine_settings set draft_value=v_value,published_value=v_value,status='Published',version=v_next,published_version=v_next,updated_by=p_actor_user_id,updated_at=now(),published_by=p_actor_user_id,published_at=now() where id=v_setting.id returning * into v_setting;
    insert into public.engine_setting_versions(setting_id,version,action,value,previous_value,reason,environment,created_by) values(v_setting.id,v_next,'Rolled back',v_value,v_previous,p_reason,p_environment,p_actor_user_id);
  elsif p_action='publish' then
    v_value:=p_value;
    update public.engine_settings set draft_value=v_value,published_value=v_value,status='Published',version=v_next,published_version=v_next,updated_by=p_actor_user_id,updated_at=now(),published_by=p_actor_user_id,published_at=now() where id=v_setting.id returning * into v_setting;
    insert into public.engine_setting_versions(setting_id,version,action,value,previous_value,reason,environment,created_by) values(v_setting.id,v_next,'Published',v_value,v_previous,p_reason,p_environment,p_actor_user_id);
  else
    v_value:=p_value;
    update public.engine_settings set draft_value=v_value,version=v_next,updated_by=p_actor_user_id,updated_at=now() where id=v_setting.id returning * into v_setting;
    insert into public.engine_setting_versions(setting_id,version,action,value,previous_value,reason,environment,created_by) values(v_setting.id,v_next,'Draft saved',v_value,v_setting.draft_value,p_reason,p_environment,p_actor_user_id);
  end if;
  if p_action in ('publish','rollback') then
    update public.engine_publication_state set revision=revision+1,last_published_at=now(),last_published_by=p_actor_user_id where singleton;
  end if;
  return v_setting;
end $$;
revoke all on function public.engine_apply_setting(text,integer,text,jsonb,text,integer,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.engine_apply_setting(text,integer,text,jsonb,text,integer,boolean,uuid,text) to service_role;

commit;
