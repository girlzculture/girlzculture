-- Run only in the isolated CLEAN_DATABASE_URL database after the complete chain.
-- Roll back every fixture, including its identity, application and revisions.
begin;
do $$
#variable_conflict error
declare
  onboarding_actor uuid := gen_random_uuid();
  onboarding_result jsonb;
  onboarding_application uuid;
  onboarding_salon uuid;
  onboarding_setup text;
  onboarding_plan text;
  onboarding_values jsonb := jsonb_build_object(
    'business_name','Onboarding verification','owner_name','Fixture Owner',
    'business_email','business-onboarding@example.test','phone','+12125550100',
    'street_address','1 Test Street','city','Brooklyn','state','NY','zip_code','11201',
    'business_type','Braiding Studio','years_in_operation',1,'stylist_count',1,
    'photo_urls','[]'::jsonb,'document_urls','[]'::jsonb
  );
  onboarding_salon_values jsonb := jsonb_build_object(
    'name','Onboarding verification','slug','business-onboarding-verification',
    'owner_name','Fixture Owner','email','business-onboarding@example.test',
    'phone','+12125550100','address_street','1 Test Street',
    'address_city','Brooklyn','address_state','NY','address_zip','11201',
    'business_type','Braiding Studio'
  );
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='salon_applications'
      and column_name='selected_plan' and column_default is null and is_nullable='NO'
  ) then raise exception 'selected_plan must remain NOT NULL with NO DEFAULT'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='salon_applications'
      and column_name='business_setup_type' and column_default is null and is_nullable='YES'
  ) then raise exception 'Historical business setup must allow null without an invented default'; end if;

  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
  values(onboarding_actor,'business-onboarding@example.test','',now(),'{"role":"salon_owner"}'::jsonb);

  foreach onboarding_plan in array array[null,'',' ','invalid','Basic','Pro'] loop
    begin
      perform public.submit_salon_application_atomic(onboarding_actor,onboarding_salon_values,
        onboarding_values || jsonb_build_object('selected_plan',onboarding_plan,'business_setup_type','solo_professional'));
      raise exception 'Unselected/invalid plan reached persistence: %',onboarding_plan;
    exception when sqlstate '22023' then null;
    end;
  end loop;
  if exists(select 1 from public.salons where user_id=onboarding_actor) then
    raise exception 'Invalid plan submissions created a salon before validation';
  end if;
  foreach onboarding_setup in array array[null,'',' ','invalid','Solo'] loop
    begin
      perform public.submit_salon_application_atomic(onboarding_actor,onboarding_salon_values,
        onboarding_values || jsonb_build_object('selected_plan','Starter','business_setup_type',onboarding_setup));
      raise exception 'Unselected/invalid business setup reached persistence: %',onboarding_setup;
    exception when sqlstate '22023' then null;
    end;
  end loop;

  foreach onboarding_setup in array array['solo_professional','shared_suite_booth','single_location_staffed','multi_location','mobile_on_location'] loop
    foreach onboarding_plan in array array['Starter','Growth','Premium'] loop
      onboarding_result := public.submit_salon_application_atomic(onboarding_actor,onboarding_salon_values,
        onboarding_values || jsonb_build_object('selected_plan',onboarding_plan,'business_setup_type',onboarding_setup));
      onboarding_application := (onboarding_result->'application'->>'id')::uuid;
      onboarding_salon := (onboarding_result->'salon'->>'id')::uuid;
      if not exists(select 1 from public.salon_applications application
        where application.id=onboarding_application and application.selected_plan=onboarding_plan
          and application.business_setup_type=onboarding_setup) then
        raise exception 'Explicit plan/business setup was not persisted exactly';
      end if;
      if not exists(select 1 from public.salon_application_revisions revision
        where revision.application_id=onboarding_application
          and revision.snapshot->>'business_setup_type'=onboarding_setup
          and revision.snapshot->>'selected_plan'=onboarding_plan) then
        raise exception 'Application revision omitted the explicit business setup/plan';
      end if;
    end loop;
  end loop;

  -- An omitted column is also rejected at the direct table boundary.
  begin
    insert into public.salon_applications(salon_id,user_id,business_name,business_setup_type)
    values(onboarding_salon,onboarding_actor,'Missing plan','solo_professional');
    raise exception 'Direct insert silently invented a plan';
  exception when sqlstate '22023' then null;
  end;
  begin
    insert into public.salon_applications(salon_id,user_id,business_name,selected_plan)
    values(onboarding_salon,onboarding_actor,'Missing setup','Starter');
    raise exception 'Direct insert silently invented a business setup';
  exception when sqlstate '22023' then null;
  end;
  if not exists(select 1 from public.salons salon where salon.id=onboarding_salon
    and salon.subscription_tier='Starter' and salon.subscription_status='inactive') then
    raise exception 'Resubmission rewrote the existing salon subscription state';
  end if;
end;
$$;
rollback;
select 'Business onboarding database assertions passed: no default, explicit choices, 15 persisted combinations, immutable revisions, and existing subscription preservation.' as result;
