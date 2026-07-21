begin;

alter table public.engine_settings add column if not exists affected_surfaces text[] not null default '{}';

update public.engine_settings set affected_surfaces=case setting_key
  when 'branding.primary_color' then array['Public site','Customer account','Salon dashboard','Admin dashboard']
  when 'branding.cta_color' then array['Public site','Customer account','Salon dashboard','Admin dashboard']
  when 'identity.admin_mfa_policy' then array['Admin login','High-risk admin actions']
  when 'salon.activation_mode' then array['Application approval','Salon activation','Public discovery']
  when 'booking.default_buffer_minutes' then array['Availability','Booking checkout']
  when 'booking.deposit_percentage' then array['Booking checkout','Booking confirmation','Finance ledger']
  when 'catalog.default_currency' then array['Public prices','Booking totals','Finance']
  when 'search.default_radius_miles' then array['Homepage discovery','Find Salons']
  when 'location.country_codes' then array['Applications','Salon profile','Discovery']
  when 'homepage.nearby_card_count' then array['Homepage Salons Near You']
  when 'content.faq_search_enabled' then array['Help Center']
  when 'trust.verified_label' then array['Salon cards','Salon profile','Search results']
  when 'notifications.booking_reminder_hours' then array['Booking reminders']
  when 'languages.supported' then array['Language selector','Translation Manager']
  when 'media.public_image_quality' then array['New image renditions']
  when 'quality.cancellation_threshold_percent' then array['Quality & Performance']
  when 'maintenance.test_data_enabled' then array['Test Data & Maintenance']
  when 'publishing.require_reason' then array['The Engine publication']
  else affected_surfaces end
where cardinality(affected_surfaces)=0;

insert into public.engine_settings(setting_key,category,display_name,description,value_type,draft_value,published_value,status,impact_level,validation,help_text,impact_description,is_public,is_secret_status,sort_order,affected_surfaces) values
('booking.minimum_lead_minutes','booking_rules','Minimum booking lead time','Minimum time between checkout and appointment start.','number','30','30','Published','booking','{"min":15,"max":1440,"integer":true}','Measured in minutes.','Affects future availability and checkout validation.',true,false,20,array['Availability','Booking checkout']),
('booking.maximum_advance_days','booking_rules','Maximum advance booking window','How far ahead customers may book.','number','180','180','Published','booking','{"min":7,"max":730,"integer":true}','Measured in calendar days.','Affects future dates offered to customers.',true,false,30,array['Availability','Booking calendar']),
('booking.client_notes_max_length','booking_rules','Client notes character limit','Maximum length of booking notes and accessibility requests.','number','1000','1000','Published','booking','{"min":100,"max":5000,"integer":true}','Existing notes are not truncated.','Affects new booking submissions.',true,false,40,array['Booking checkout']),
('homepage.featured_card_count','homepage_composition','Featured salon card count','Maximum sponsored salon cards in the standard homepage row.','number','12','12','Published','customer','{"min":1,"max":24,"integer":true}','Campaign eligibility and weighting remain in Featured Campaigns.','Affects homepage sponsored placement query size.',true,false,20,array['Homepage Featured Salons']),
('homepage.trending_card_count','homepage_composition','Trending card count','Maximum trending cards in the standard homepage row.','number','12','12','Published','customer','{"min":1,"max":24,"integer":true}','Campaign scheduling remains in Trending Campaigns.','Affects homepage trending placement query size.',true,false,30,array['Homepage Trending']),
('catalog.size_options','service_catalog','Standard size options','Reusable size labels offered when configuring services.','reorderable_list','["Small","Medium","Large","Extra Large"]','["Small","Medium","Large","Extra Large"]','Published','customer','{"maxItems":30}','Salon-specific pricing remains owned by each salon.','Changes available option labels for future service edits.',true,false,20,array['Salon Styles & Pricing','Booking options']),
('catalog.length_options','service_catalog','Standard length options','Reusable hair-length labels offered when configuring services.','reorderable_list','["Shoulder","Mid-back","Lower Back","Waist","Butt Length"]','["Shoulder","Mid-back","Lower Back","Waist","Butt Length"]','Published','customer','{"maxItems":40}','Salon-specific prices remain attached to salon services.','Changes available length labels for future service edits.',true,false,30,array['Salon Styles & Pricing','Booking options']),
('catalog.material_quality_grades','service_catalog','Material quality grades','Approved quality labels for hair and material choices.','reorderable_list','["Good","Better","Premium","Luxury"]','["Good","Better","Premium","Luxury"]','Published','customer','{"maxItems":20}','Quality labels describe options; they do not verify a brand claim.','Changes material option labels.',true,false,40,array['Salon Styles & Pricing','Salon profile','Booking options']),
('catalog.material_options','service_catalog','Hair and material options','Reusable hair and material choices for salon services.','reorderable_list','["Kanekalon (standard)","X-Pression (premium)","Pre-stretched (premium)","Human hair (luxury)","Client provides own hair"]','["Kanekalon (standard)","X-Pression (premium)","Pre-stretched (premium)","Human hair (luxury)","Client provides own hair"]','Published','customer','{"maxItems":40}','Salons set their own material price and availability.','Changes future material choices in salon service editors.',true,false,41,array['Salon Styles & Pricing','Salon profile','Booking options']),
('catalog.material_longevity_weeks','service_catalog','Material longevity choices','Reusable expected-longevity choices measured in weeks.','reorderable_list','["1","2","3","4","5","6","7","8","9","10","11","12"]','["1","2","3","4","5","6","7","8","9","10","11","12"]','Published','customer','{"maxItems":52}','These are descriptive estimates, not guarantees.','Changes future material longevity choices.',true,false,42,array['Salon Styles & Pricing','Salon profile']),
('catalog.included_items','service_catalog','Included service items','Reusable checklist for what a salon includes with a service.','reorderable_list','["Consultation","Wash & blow-dry","Scalp treatment","Braiding hair","Premium hair","Style & finish","Aftercare tips"]','["Consultation","Wash & blow-dry","Scalp treatment","Braiding hair","Premium hair","Style & finish","Aftercare tips"]','Published','customer','{"maxItems":60}','Salons choose which items apply to each service.','Changes future included-item choices.',true,false,43,array['Salon Styles & Pricing','Salon profile']),
('catalog.business_types','service_catalog','Business types','Business classifications offered during salon application.','reorderable_list','["Braiding Studio","Hair Salon","Beauty Shop","Independent Braider","Mobile Braider","Natural Hair Studio","Other"]','["Braiding Studio","Hair Salon","Beauty Shop","Independent Braider","Mobile Braider","Natural Hair Studio","Other"]','Published','safety','{"maxItems":30}','Changing application classifications can affect review workflows.','Changes future salon applications.',true,false,60,array['Salon application','Admin submissions']),
('quality.complaint_reasons','quality_support','Complaint reasons','Categories customers can choose when reporting a booking problem.','reorderable_list','["Service quality","Safety or hygiene","Appointment timing","Pricing or payment","Professional conduct","Other"]','["Service quality","Safety or hygiene","Appointment timing","Pricing or payment","Professional conduct","Other"]','Published','safety','{"maxItems":40}','Keep categories broad enough to avoid exposing sensitive details.','Changes future complaint intake choices.',true,false,30,array['Complaint form','Admin Customer Support']),
('quality.cancellation_reasons','quality_support','Cancellation reasons','Operational reasons available to salons and administrators.','reorderable_list','["Customer requested","Fully booked","Walk-in took the slot","Stylist unavailable","Salon closed","Scheduling conflict","Payment issue","Other"]','["Customer requested","Fully booked","Walk-in took the slot","Stylist unavailable","Salon closed","Scheduling conflict","Payment issue","Other"]','Published','booking','{"maxItems":40}','Free-text detail remains available in audited flows.','Changes cancellation reason choices.',true,false,40,array['Salon bookings','Admin bookings']),
('support.ticket_categories','quality_support','Support request categories','Categories available on the public Contact form.','reorderable_list','["Bookings","Payments","Account access","Salon concern","Safety","Partnerships","Technical issue","Other"]','["Bookings","Payments","Account access","Salon concern","Safety","Partnerships","Technical issue","Other"]','Published','customer','{"maxItems":40}','Routing rules can be added without changing submitted history.','Changes future support request classification.',true,false,50,array['Contact Us','Admin Customer Support']),
('support.ticket_statuses','quality_support','Support ticket statuses','Operational states available to support administrators.','reorderable_list','["Open","In Progress","Waiting on Customer","Resolved","Closed"]','["Open","In Progress","Waiting on Customer","Resolved","Closed"]','Published','safety','{"maxItems":20}','Historical status values are retained.','Changes support workflow choices.',true,false,60,array['Admin Customer Support']),
('notifications.channels','notifications','Enabled transactional channels','Channels the platform may attempt for transactional booking updates.','reorderable_list','["email","sms","push"]','["email","sms","push"]','Published','booking','{"maxItems":3}','A channel also requires its secure provider credentials and a valid recipient destination.','Affects future booking notification delivery attempts.',false,false,20,array['Booking confirmation notifications','Booking cancellation notifications']),
('notifications.booking_customer_confirmed_subject','notifications','Customer confirmation email subject','Subject for customer booking-confirmation emails.','text','"Your Girlz Culture appointment is confirmed"','"Your Girlz Culture appointment is confirmed"','Published','customer','{"minLength":5,"maxLength":140}','Do not include private booking data in the subject.','Affects future customer confirmation emails.',false,false,30,array['Customer booking email']),
('notifications.booking_salon_confirmed_subject','notifications','Salon confirmation email subject','Subject for new-booking emails sent to salons.','text','"New confirmed Girlz Culture booking"','"New confirmed Girlz Culture booking"','Published','customer','{"minLength":5,"maxLength":140}','Do not include private customer data in the subject.','Affects future salon confirmation emails.',false,false,40,array['Salon booking email']),
('notifications.booking_customer_cancelled_subject','notifications','Customer cancellation email subject','Subject for cancellation emails sent to customers.','text','"Your Girlz Culture appointment was cancelled"','"Your Girlz Culture appointment was cancelled"','Published','customer','{"minLength":5,"maxLength":140}','Cancellation details remain inside the message body.','Affects future customer cancellation emails.',false,false,50,array['Customer cancellation email']),
('notifications.booking_salon_cancelled_subject','notifications','Salon cancellation email subject','Subject for cancellation emails sent to salons.','text','"Girlz Culture booking cancelled"','"Girlz Culture booking cancelled"','Published','customer','{"minLength":5,"maxLength":140}','Cancellation details remain inside the message body.','Affects future salon cancellation emails.',false,false,60,array['Salon cancellation email']),
('languages.fallback_locale','languages','Fallback locale','Locale used when a published translation is missing.','text','"en"','"en"','Published','customer','{"allowed":["en"]}','English is the integrity-safe source locale while optional translations are being completed.','Affects untranslated labels across localized surfaces.',true,false,20,array['Public site','Booking','Customer account','Salon dashboard','Admin dashboard'])
on conflict(setting_key) do nothing;

update public.engine_settings
set is_public=true
where setting_key in ('media.public_image_quality','quality.cancellation_threshold_percent');

update public.engine_settings
set validation='{"maxItems":1,"allowedItems":["US"]}'::jsonb
where setting_key='location.country_codes';

update public.engine_settings set published_version=1 where status='Published' and published_version=0;
insert into public.engine_setting_versions(setting_id,version,action,value,previous_value,reason,environment,created_by)
select id,1,'Published',published_value,null,'Initial governed baseline',environment,published_by from public.engine_settings where status='Published'
on conflict(setting_id,version) do nothing;

create or replace function public.engine_import_drafts(
  p_entries jsonb,
  p_actor_user_id uuid,
  p_environment text,
  p_confirmation text
) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_entry jsonb;v_setting public.engine_settings%rowtype;v_next integer;v_results jsonb:='[]'::jsonb;v_allowed boolean:=false;
begin
  select exists(select 1 from public.admin_users a where coalesce(a.user_id,a.id)=p_actor_user_id and lower(coalesce(a.status,'active'))='active' and (coalesce(a.is_super_admin,false) or coalesce((a.permissions->>'settings')::boolean,false))) into v_allowed;
  if not v_allowed then raise exception 'ENGINE_IMPORT_FORBIDDEN';end if;
  if p_environment not in ('development','preview','production') then raise exception 'ENGINE_ENVIRONMENT_INVALID';end if;
  if p_confirmation is distinct from ('IMPORT DRAFTS '||p_environment) then raise exception 'ENGINE_IMPORT_CONFIRMATION_REQUIRED';end if;
  if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)=0 or jsonb_array_length(p_entries)>100 then raise exception 'ENGINE_IMPORT_SIZE_INVALID';end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    select * into v_setting from public.engine_settings where setting_key=v_entry->>'setting_key' for update;
    if not found then raise exception 'ENGINE_IMPORT_SETTING_NOT_FOUND:%',v_entry->>'setting_key';end if;
    if v_setting.is_secret_status then raise exception 'ENGINE_IMPORT_SECRET_BLOCKED:%',v_setting.setting_key;end if;
    if v_setting.environment not in ('all',p_environment) then raise exception 'ENGINE_IMPORT_ENVIRONMENT_MISMATCH:%',v_setting.setting_key;end if;
    if v_setting.version<>coalesce((v_entry->>'expected_version')::integer,0) then raise exception 'ENGINE_IMPORT_VERSION_CONFLICT:%',v_setting.setting_key;end if;
    v_next:=v_setting.version+1;
    update public.engine_settings set draft_value=v_entry->'value',status=case when status='Published' then 'Published' else 'Draft' end,version=v_next,updated_by=p_actor_user_id,updated_at=now() where id=v_setting.id;
    insert into public.engine_setting_versions(setting_id,version,action,value,previous_value,reason,environment,created_by) values(v_setting.id,v_next,'Draft saved',v_entry->'value',v_setting.draft_value,'Imported as governed draft',p_environment,p_actor_user_id);
    v_results:=v_results||jsonb_build_array(jsonb_build_object('setting_key',v_setting.setting_key,'version',v_next));
  end loop;
  return jsonb_build_object('imported',jsonb_array_length(v_results),'settings',v_results,'environment',p_environment);
end $$;
revoke all on function public.engine_import_drafts(jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.engine_import_drafts(jsonb,uuid,text,text) to service_role;

create or replace function public.engine_emergency_revert_setting(
  p_setting_key text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_reason text,
  p_confirmation text,
  p_environment text
) returns public.engine_settings
language plpgsql security definer set search_path=public,auth as $$
declare v_setting public.engine_settings%rowtype;v_previous public.engine_setting_versions%rowtype;v_next integer;v_allowed boolean:=false;v_current jsonb;
begin
  select exists(select 1 from public.admin_users a where coalesce(a.user_id,a.id)=p_actor_user_id and lower(coalesce(a.status,'active'))='active' and coalesce(a.is_super_admin,false)) into v_allowed;
  if not v_allowed then raise exception 'Only a Super Admin can use emergency configuration recovery.';end if;
  if p_environment not in ('development','preview','production') then raise exception 'ENGINE_ENVIRONMENT_INVALID';end if;
  if length(trim(coalesce(p_reason,'')))<8 then raise exception 'Enter an emergency recovery reason of at least 8 characters.';end if;
  if p_confirmation is distinct from ('REVERT '||p_setting_key) then raise exception 'Type the exact emergency confirmation.';end if;
  select * into v_setting from public.engine_settings where setting_key=p_setting_key for update;
  if not found then raise exception 'SETTING_NOT_FOUND';end if;
  if v_setting.environment not in ('all',p_environment) then raise exception 'ENGINE_ENVIRONMENT_MISMATCH';end if;
  if v_setting.version<>p_expected_version then raise exception 'SETTING_VERSION_CONFLICT';end if;
  if v_setting.is_secret_status then raise exception 'SECRET_STATUS_READ_ONLY';end if;
  select * into v_previous from public.engine_setting_versions where setting_id=v_setting.id and action in ('Published','Rolled back') and version<v_setting.published_version order by version desc limit 1;
  if not found then raise exception 'No earlier published version is available for emergency recovery.';end if;
  v_next:=v_setting.version+1;v_current:=v_setting.published_value;
  update public.engine_settings set draft_value=v_previous.value,published_value=v_previous.value,status='Published',version=v_next,published_version=v_next,updated_by=p_actor_user_id,updated_at=now(),published_by=p_actor_user_id,published_at=now() where id=v_setting.id returning * into v_setting;
  insert into public.engine_setting_versions(setting_id,version,action,value,previous_value,reason,environment,created_by) values(v_setting.id,v_next,'Rolled back',v_previous.value,v_current,'EMERGENCY: '||p_reason,p_environment,p_actor_user_id);
  update public.engine_publication_state set revision=revision+1,last_published_at=now(),last_published_by=p_actor_user_id where singleton;
  return v_setting;
end $$;
revoke all on function public.engine_emergency_revert_setting(text,integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.engine_emergency_revert_setting(text,integer,uuid,text,text,text) to service_role;

commit;
