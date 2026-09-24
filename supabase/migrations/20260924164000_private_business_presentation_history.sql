-- Install reviewed controls only; refreshing the existing private business is an explicit guarded action.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Installed only by the protected migration; invocation is a separate, explicit admin action.
create or replace function public.seed_private_demo(p_salon uuid,p_owner uuid,p_anchor date)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,gc_private as $$
declare
 w gc_private.demo_workspaces%rowtype;v_start date;v_now timestamptz;v_day date;v_at timestamptz;
 i integer;j integer;m integer;k integer;v_style uuid;v_staff uuid;v_client uuid;v_booking uuid;v_receipt uuid;v_sale uuid;
 v_deposit_id uuid;v_price numeric;v_hours numeric;v_status text;v_plan text;v_count integer;v_client_index integer;v_staff_index integer;v_slot integer;v_days integer;v_discount numeric;v_total numeric;v_quantity integer;v_client_name text;
 v_photos jsonb='["https://girlzculture.com/images/culture-house/cover.webp","https://girlzculture.com/images/culture-house/amara.webp","https://girlzculture.com/images/culture-house/boho-braids.webp","https://girlzculture.com/images/culture-house/box-braids.webp","https://girlzculture.com/images/culture-house/loc-retwist.webp","https://girlzculture.com/images/culture-house/cornrows.webp","https://girlzculture.com/images/culture-house/two-strand-twists.webp","https://girlzculture.com/images/culture-house/feed-in-braids.webp"]';
 v_staff_photos text[]=array['https://girlzculture.com/images/culture-house/amara.webp','https://girlzculture.com/images/culture-house/nia.webp','https://girlzculture.com/images/culture-house/zuri.webp','https://girlzculture.com/images/culture-house/imani.webp','https://girlzculture.com/images/culture-house/leila.webp','https://girlzculture.com/images/culture-house/sienna.webp'];
 v_product_photos text[]=array['https://girlzculture.com/images/culture-house/moisture-shampoo.webp','https://girlzculture.com/images/culture-house/leave-in-conditioner.webp','https://girlzculture.com/images/culture-house/scalp-oil.webp','https://girlzculture.com/images/culture-house/satin-bonnet.webp'];
 v_names text[]=array['Amara Bennett','Nia Ellis','Zuri Morgan','Imani Brooks','Leila Hayes','Sienna Reed'];
 v_first text[]=array['Emma','Julia','Amara','Maya','Olivia','Isabel','Ava','Naomi','Chloe','Elena','Sofia','Zoe','Grace','Aria','Nora','Jade','Mila','Ruby','Lena','Tessa','Camille','Alice','Dalia','Freya'];
 v_last text[]=array['Bennett','Ellis','Morgan','Brooks','Hayes','Reed','Parker','Lane','West','Hart','Blake','Wells','Quinn','James','Davis','Moore','Cole','Banks','Stone','Green'];
 v_services text[]=array['Boho / Knotless Braids','Box Braids','Loc Retwist','Cornrows','Two-Strand Twists','Feed-in Braids'];
 v_groups text[]=array['Braids','Braids','Locs','Cornrows','Twists','Braids'];
 v_products text[]=array['Moisture Shampoo','Leave-in Conditioner','Scalp Oil','Satin Bonnet'];
 v_prices numeric[]=array[210,95,110,125,55,65];
 v_durations numeric[]=array[4,2,2,3,1,1];
 v_group public.service_groups%rowtype;
begin
 if p_anchor>current_date or p_anchor<current_date-31 then raise exception 'DEMO_ANCHOR_INVALID';end if;
 select * into w from gc_private.demo_workspaces where salon_id=p_salon and owner_id=p_owner for update;
 if not found or not gc_private.demo_actor(p_owner) or not exists(select 1 from public.salons where id=p_salon and user_id=p_owner and is_demo) then raise exception 'DEMO_WORKSPACE_REQUIRED';end if;
 if w.seeded_at is not null then return jsonb_build_object('already_seeded',true,'salon_id',p_salon,'anchor_date',w.anchor_date);end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 v_start=(date_trunc('month',p_anchor)-interval '13 months')::date;
 update public.salons set name='Culture House',description='Protective styling, healthy hair and thoughtful care in Harlem.',
  owner_name='Amara Bennett',operator_type='team',business_type='Hair Salon',status='Approved',application_state='Approved',approved_at=now(),
  subscription_tier='Premium',subscription_status='Active',date_joined=v_start,created_at=v_start,
  address_street='123 Culture Avenue',address_city='New York',address_state='NY',address_zip='10027',neighborhood='Harlem',
  time_zone='America/New_York',media_consent=true,onboarding_completed_at=v_start,onboarding_progress=100,
  hours='{"Sun":{"open":"09:00","close":"20:00"},"Mon":{"open":"09:00","close":"20:00"},"Tue":{"open":"09:00","close":"20:00"},"Wed":{"open":"09:00","close":"20:00"},"Thu":{"open":"09:00","close":"20:00"},"Fri":{"open":"09:00","close":"20:00"},"Sat":{"open":"09:00","close":"20:00"}}',
  cover_photo_url=v_photos->>0,logo_url='https://girlzculture.com/images/culture-house/logo.svg',gallery_photos=v_photos,photo_metadata='{"https://girlzculture.com/images/culture-house/cover.webp":{"category":"space","title":"Our studio","caption":"","featured":true,"source_locale":"en"},"https://girlzculture.com/images/culture-house/amara.webp":{"category":"team","title":"Amara Bennett","caption":"","featured":false,"source_locale":"en"},"https://girlzculture.com/images/culture-house/boho-braids.webp":{"category":"services","title":"Boho / Knotless Braids","caption":"","featured":true,"source_locale":"en"},"https://girlzculture.com/images/culture-house/box-braids.webp":{"category":"services","title":"Box Braids","caption":"","featured":true,"source_locale":"en"},"https://girlzculture.com/images/culture-house/loc-retwist.webp":{"category":"services","title":"Loc Retwist","caption":"","featured":false,"source_locale":"en"},"https://girlzculture.com/images/culture-house/cornrows.webp":{"category":"services","title":"Cornrows","caption":"","featured":false,"source_locale":"en"},"https://girlzculture.com/images/culture-house/two-strand-twists.webp":{"category":"services","title":"Two-Strand Twists","caption":"","featured":false,"source_locale":"en"},"https://girlzculture.com/images/culture-house/feed-in-braids.webp":{"category":"services","title":"Feed-in Braids","caption":"","featured":false,"source_locale":"en"}}',phone='+12125550100'
 where id=p_salon;
 update auth.users set raw_user_meta_data=raw_user_meta_data||jsonb_build_object('name','Amara Bennett','full_name','Amara Bennett','first_name','Amara') where id=p_owner and raw_app_meta_data->>'gc_demo'='true';
 insert into public.subscriptions(id,salon_id,tier,status,billing_start,current_period_start,current_period_end)
 values(gc_private.demo_record_id(p_salon,'subscription',1),p_salon,'Premium','active',v_start,date_trunc('month',p_anchor),'2099-01-01');
 -- The same versioned deposit rule used by the real booking calculation.
 perform public.save_business_deposit_rule(p_salon,p_owner,gen_random_uuid(),
  (select id from public.business_deposit_rules where salon_id=p_salon order by created_at desc,id desc limit 1),
  '{"rate":20,"threshold_amount":null,"threshold_rate":null,"repeat_incident_count":null,"repeat_incident_rate":null,"incident_window_days":365}');
 select id into v_deposit_id from public.business_deposit_rules where salon_id=p_salon order by created_at desc,id desc limit 1;
 for i in 1..6 loop
  v_staff=gc_private.demo_record_id(p_salon,'staff',i);
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_staff,coalesce((select email from auth.users where id=v_staff),v_staff||'@private-demo.invalid'),'',now(),'{"gc_demo":true}',jsonb_build_object('role','salon_staff','name',v_names[i]),v_start,now()) on conflict(id)do update set raw_user_meta_data=excluded.raw_user_meta_data where auth.users.raw_app_meta_data->>'gc_demo'='true';
  insert into public.stylists(id,salon_id,user_id,name,slug,bio,specialties,photos,is_active,is_draft,years_experience,availability,created_at)
  values(v_staff,p_salon,v_staff,v_names[i],'professional-'||i,'Protective styling with a focus on scalp care, comfort and a lasting finish.',
   (select coalesce(jsonb_agg(name),'[]'::jsonb) from (
     select m.name from public.master_styles m join public.service_groups g on g.id=m.service_group_id
     join public.service_categories c on c.id=g.category_id
     where m.is_active and m.archived_at is null and g.is_active and g.archived_at is null and c.is_active and c.archived_at is null
       and g.name in ('Braids','Protective Styles','Locs','Cornrows','Twists')
     order by m.name,m.id limit 3) specialties),
   jsonb_build_array(v_staff_photos[i]),true,false,3+i,(select hours from public.salons where id=p_salon),v_start);
  insert into public.salon_team_members(id,salon_id,user_id,stylist_id,email,name,role,permissions,status,invited_by,activated_at)
  values(gc_private.demo_record_id(p_salon,'member',i),p_salon,v_staff,v_staff,coalesce((select email from auth.users where id=v_staff),v_staff||'@private-demo.invalid'),v_names[i],case when i=1 then 'Manager' else 'Stylist' end,
  '{"overview":true,"bookings":true,"styles":true,"availability":true,"photos":true,"earnings_own":true,"finance_log":true}', 'Active',p_owner,v_start);
  insert into public.business_compensation_arrangements(id,salon_id,stylist_id,effective_from,kind,basis,percent,created_by)
  values(gc_private.demo_record_id(p_salon,'arrangement',i),p_salon,v_staff,v_start-7,'commission','after_discount',50,p_owner);
 end loop;
 for i in 1..6 loop
  -- Fictional services use the existing custom-service path. Published Engine
  -- style names can be renamed or withdrawn without invalidating this demo.
  -- Keep the active group/category guards; never restore or invent public rows.
  select g.* into v_group from public.service_groups g
  join public.service_categories c on c.id=g.category_id
  where g.is_active and g.archived_at is null and c.is_active and c.archived_at is null
    and (g.name=v_groups[i] or (v_groups[i] in ('Braids','Cornrows') and g.name='Protective Styles'))
  order by case when g.name=v_groups[i] then 0 else 1 end,g.sort_order,g.id limit 1;
  if not found then raise exception 'DEMO_SERVICE_GROUP_REQUIRED';end if;
  insert into public.styles(id,salon_id,name,category,description,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,photos,master_style_id,category_id,service_group_id,is_draft,is_featured,sort_order,created_at)
  values(gc_private.demo_record_id(p_salon,'service',i),p_salon,v_services[i],v_group.name,case i when 1 then 'Lightweight braids with a soft, flowing finish. Hair consultation included.' when 2 then 'Classic box braids, finished with scalp care and styling guidance.' when 3 then 'Clean parts and a gentle retwist for maintained locs.' when 4 then 'Neat, lasting cornrows tailored to your preferred pattern.' when 5 then 'Soft twists with a hydrated, natural finish.' else 'Seamless feed-in braids with comfortable tension.' end,v_durations[i],v_durations[i],v_prices[i],v_prices[i],v_prices[i],jsonb_build_array(v_photos->>(i+1)),null,v_group.category_id,v_group.id,false,i<=3,i,v_start);
 end loop;
 update public.stylists set assigned_service_ids=(select array_agg(id order by sort_order) from public.styles where salon_id=p_salon) where salon_id=p_salon;
 for i in 1..4 loop
  insert into public.salon_products(id,salon_id,name,description,photo_url,images,price,sku,inventory_quantity,track_inventory,low_stock_threshold,product_status,is_visible,pickup_enabled,shipping_enabled,created_at)
  values(gc_private.demo_record_id(p_salon,'product',i),p_salon,v_products[i],case i when 1 then 'Gentle cleansing for hydrated hair.' when 2 then 'Daily moisture and easy detangling.' when 3 then 'Lightweight nourishment for the scalp.' else 'Protect your style overnight.' end,v_product_photos[i],jsonb_build_array(v_product_photos[i]),12+i*3,'CH-'||lpad(i::text,3,'0'),360,true,10,'Active',true,true,false,v_start);
 end loop;
 for i in 1..480 loop
  v_client=gc_private.demo_record_id(p_salon,'client',i);
  v_client_name=v_first[1+(i-1)%24]||' '||v_last[1+(i-1)/24];
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_client,coalesce((select email from auth.users where id=v_client),v_client||'@private-demo.invalid'),'',now(),'{"gc_demo":true}',jsonb_build_object('role','customer','name',v_client_name),v_start,now()) on conflict(id)do update set raw_user_meta_data=excluded.raw_user_meta_data where auth.users.raw_app_meta_data->>'gc_demo'='true';
  insert into public.customers(id,name,email,phone,created_at) values(v_client,v_client_name,coalesce((select email from auth.users where id=v_client),v_client||'@private-demo.invalid'),null,v_start)
  on conflict(id)do update set name=excluded.name,email=excluded.email,phone=excluded.phone;
  insert into public.business_client_cards(id,salon_id,subject_key,preferences,notes,cautions,source_locale,updated_by)
  values(gc_private.demo_record_id(p_salon,'card',i),p_salon,'customer:'||v_client,case i%3 when 0 then 'Prefers a morning appointment and a natural finish.' when 1 then 'Comfortable tension; protect the edges.' else 'Likes shoulder-length styles and a centre part.' end,'Review the style and care routine at each visit.','','en',p_owner);
 end loop;
 insert into public.business_policy_revisions(id,salon_id,policy,source_locale,version,created_by,published_at,published_by)
 values(gc_private.demo_record_id(p_salon,'policy',2),p_salon,'{"cancellation_hours":24,"rescheduling_hours":24,"grace_minutes":15,"no_show":"contact_business","late_arrival":"contact_business","deposit_treatment":"platform_rules","balance_due":"after_service","satisfaction":"contact_business","preparation":"Arrive with detangled hair unless your service includes preparation.","guests":"ask_first","children":"ask_first","walk_ins":"welcome","notes":"Please contact us before your appointment if your plans change.","refund_satisfaction":"contact_business","refund_terms":"Discuss the result with the business.","business_policy_text":null}','en',(select coalesce(max(version),0)+1 from public.business_policy_revisions where salon_id=p_salon),p_owner,now(),p_owner) on conflict(id)do nothing;
 update public.salons set business_policy_revision_id=gc_private.demo_record_id(p_salon,'policy',2) where id=p_salon;
 -- Each professional has at most two four-hour appointments (09:00/14:00).
 -- Tuesday-Saturday working weeks, a 15-minute service buffer, deterministic
 -- seasonal occupancy and distinct clients make capacity auditable.
 for m in 0..13 loop
  v_days=extract(day from (v_start+make_interval(months=>m+1)-interval '1 day'))::integer;
  if m=13 then v_days=extract(day from p_anchor)::integer-1;end if;
  for j in 0..v_days-1 loop
   v_day=(v_start+make_interval(months=>m))::date+j;
   if extract(isodow from v_day) in (1,7) then continue;end if;
   for v_staff_index in 1..6 loop
    for v_slot in 0..1 loop
     i=m*372+j*12+(v_staff_index-1)*2+v_slot+1;
     if (j*7+v_staff_index*3+v_slot+m)% (5+m%4)=0 then continue;end if;
     v_at=(v_day+make_time(9+5*v_slot,0,0)) at time zone 'America/New_York';
     v_staff=gc_private.demo_record_id(p_salon,'staff',v_staff_index);
     k=1+(i+m)%6;v_style=gc_private.demo_record_id(p_salon,'service',k);
     v_client_index=1+((m*173+j*12+(v_staff_index-1)*2+v_slot)%480);
     v_client=gc_private.demo_record_id(p_salon,'client',v_client_index);
     v_client_name=v_first[1+(v_client_index-1)%24]||' '||v_last[1+(v_client_index-1)/24];
     v_price=v_prices[k];v_hours=v_durations[k];
     v_discount=case when i%13=0 then round(v_price*0.1,2) else 0 end;v_total=v_price-v_discount;
     v_status=case when i%29=0 then 'No Show' when i%17=0 then 'Cancelled' else 'Completed' end;
     v_booking=gc_private.demo_record_id(p_salon,'booking',i);
     insert into public.bookings(id,salon_id,customer_id,stylist_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,deposit_status,balance_due,status,source,payment_mode,created_at,service_completed_at,client_notes,subtotal_before_promotion,original_deposit_amount,deposit_percentage,deposit_rule_snapshot,promotion_discount_amount,promotion_snapshot)
     values(v_booking,p_salon,v_client,v_staff,v_style,v_client_name,(select email from auth.users where id=v_client),v_at,v_hours,v_total,round(v_price*0.2,2),'Paid',v_total-round(v_price*0.2,2),v_status,'sample','test',v_at-make_interval(days=>3+i%18),case when v_status='Completed' then v_at+v_hours*interval '1 hour' else null end,
      case i%3 when 0 then 'Natural finish, medium length.' when 1 then 'Light tension around the hairline.' else 'Review the reference style before starting.' end,
      v_price,round(v_price*0.2,2),20,jsonb_build_object('version',v_deposit_id,'basis','eligible_service_subtotal_before_discounts','subtotal',v_price,'deposit',round(v_price*0.2,2),'rate',20),v_discount,
      case when v_discount>0 then jsonb_build_object('promotion_id',gc_private.demo_record_id(p_salon,'promotion',1),'title','Fresh Style Offer','discount_amount',v_discount,'adjusted_total',v_total,'subtotal_before_promotion',v_price) else '{}'::jsonb end);
     v_receipt=gc_private.demo_record_id(p_salon,'deposit',i);
     insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
     values(v_receipt,p_salon,v_booking,v_at-make_interval(days=>3+i%18),'deposit','other',round(v_price*20)::bigint,'Appointment deposit',p_owner);
     if v_status='Completed' then
      insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
      values(gc_private.demo_record_id(p_salon,'balance',i),p_salon,v_booking,v_at+v_hours*interval '1 hour','balance',case i%3 when 0 then 'cash' else 'other' end,round((v_total-v_price*0.2)*100)::bigint,'Service balance',p_owner);
      if i%7=0 then
       insert into public.business_client_formulas(salon_id,card_id,booking_id,formula,source_locale,updated_by)
       values(p_salon,gc_private.demo_record_id(p_salon,'card',v_client_index),v_booking,jsonb_build_object('technique',v_services[k],'size','Medium','length','Shoulder length','instructions','Light tension, protect the edges.','duration_minutes',v_hours*60),'en',p_owner);
      end if;
      if i%9=0 then
       insert into public.reviews(id,booking_id,customer_id,salon_id,stylist_id,rating_overall,written_review,display_name,moderation_status,created_at)
       values(gc_private.demo_record_id(p_salon,'review',i),v_booking,v_client,p_salon,v_staff,4+(i%2),case i%3 when 0 then 'Comfortable braids and a beautiful finish. I will be back.' when 1 then 'My appointment started on time, and I loved the care advice.' else 'A welcoming team and careful attention to my hair.' end,v_client_name,'Published',v_at+interval '1 day');
      end if;
     elsif v_status='Cancelled' then
      insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,original_payment_id,note,created_by)
      values(gc_private.demo_record_id(p_salon,'refund',i),p_salon,v_booking,v_at-interval '1 day','refund','other',round(v_price*20)::bigint,v_receipt,'Deposit returned after cancellation',p_owner);
     end if;
    end loop;
   end loop;
  end loop;
  -- An ordinary private offline sale exercises the real stock and accounting pipeline.
  for k in 1..4 loop
   v_sale=gc_private.demo_record_id(p_salon,'retail',m*4+k);v_quantity=8+(m*3+k*2)%13;
   v_at=(v_start+make_interval(months=>m)+interval '8 days 16 hours') at time zone 'America/New_York';
   insert into public.business_finance_sales(id,salon_id,occurred_at,source,kind,name,product_id,list_cents,cost_cents,quantity,created_by)
   values(v_sale,p_salon,v_at,'walk_in','product',v_products[k],gc_private.demo_record_id(p_salon,'product',k),(12+k*3)*100*v_quantity,(600+k*100)*v_quantity,v_quantity,p_owner);
   insert into public.business_finance_receipts(id,salon_id,sale_id,occurred_at,stage,method,amount_cents,note,created_by)
   values(gc_private.demo_record_id(p_salon,'retail-receipt',m*4+k),p_salon,v_sale,v_at,'full','other',(12+k*3)*100*v_quantity,'Retail sales',p_owner);
  end loop;
  -- A walk-in is never represented as a platform-paid appointment.
  if m<13 or extract(day from p_anchor)>2 then
  v_staff=gc_private.demo_record_id(p_salon,'staff',1+m%6);
  v_at=((v_start+make_interval(months=>m))::date+(case when m=13 then least(19,extract(day from p_anchor)::integer-2) else 19 end)+time '18:30') at time zone 'America/New_York';
  insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,source,booking_origin,business_added_by,business_added_request_id,manual_service_name,business_policy_acceptance_kind,payment_mode,service_completed_at,created_at)
  values(gc_private.demo_record_id(p_salon,'walk-in',m),p_salon,gc_private.demo_record_id(p_salon,'service',5),v_staff,v_first[1+m]||' '||v_last[4],v_at,1,0,0,0,'Not collected by Girlz Culture',case when v_at<p_anchor::timestamp then 'Completed' else 'Confirmed' end,'walk_in','business_added',p_owner,gc_private.demo_record_id(p_salon,'walk-in-request',m),v_services[5],'business_added_not_accepted','test',case when v_at<p_anchor::timestamp then v_at+interval '1 hour' end,v_at-interval '10 minutes');
  if v_at<p_anchor::timestamp then
   v_sale=gc_private.demo_record_id(p_salon,'walk-in-sale',m);
   insert into public.business_finance_sales(id,salon_id,occurred_at,source,kind,name,stylist_id,client_name,list_cents,compensation,created_by)
   values(v_sale,p_salon,v_at,'walk_in','service',v_services[5],v_staff,v_first[1+m]||' '||v_last[4],5500,public.business_compensation_snapshot(p_salon,v_staff,v_at),p_owner);
   insert into public.business_finance_receipts(id,salon_id,sale_id,occurred_at,stage,method,amount_cents,note,created_by)
   values(gc_private.demo_record_id(p_salon,'walk-in-receipt',m),p_salon,v_sale,v_at,'full','other',5500,'Twist service balance',p_owner);
  end if;
  end if;
  insert into public.business_finance_expenses(id,salon_id,occurred_at,category,amount_cents,treatment,note,created_by)
  values(gc_private.demo_record_id(p_salon,'rent',m),p_salon,v_start+make_interval(months=>m),'Rent',320000,'operating','Monthly studio rent',p_owner),
  (gc_private.demo_record_id(p_salon,'supplies',m),p_salon,v_start+make_interval(months=>m)+interval '5 days','Supplies',45000+(m%4)*5500,'operating','Styling supplies and consumables',p_owner);
  insert into public.billing_events(id,salon_id,salon_name,event_date,event_type,new_plan,amount_collected,payment_status,stripe_event_id,metadata)
  values(gc_private.demo_record_id(p_salon,'billing',m),p_salon,'Culture House',((v_start+make_interval(months=>m)+interval '12 hours') at time zone 'America/New_York'),'sample_subscription','Premium',19900,'Simulated','gc-demo:'||p_salon||':'||m,'{"sample":true,"provider_charge":false}');
 end loop;
 -- Pay the earned sample commission through each historical month, never a provider payout.
 for m in 0..13 loop
  for k in 1..6 loop
   v_staff=gc_private.demo_record_id(p_salon,'staff',k);
   select coalesce(sum(round(b.estimated_total*100*(b.operating_compensation->>'percent')::numeric/100)),0) into v_price
    from public.bookings b where b.salon_id=p_salon and b.stylist_id=v_staff and b.status='Completed'
     and b.service_completed_at>=v_start+make_interval(months=>m) and b.service_completed_at<v_start+make_interval(months=>m+1);
   select v_price+coalesce(sum(round(agreed_cents*(compensation->>'percent')::numeric/100)),0) into v_price from public.business_finance_sales
    where salon_id=p_salon and stylist_id=v_staff and kind='service' and occurred_at>=v_start+make_interval(months=>m) and occurred_at<v_start+make_interval(months=>m+1);
   if v_price>0 then
    insert into public.business_compensation_payments(id,salon_id,stylist_id,occurred_at,kind,amount_cents,method,created_by)
    values(gc_private.demo_record_id(p_salon,'compensation',m*6+k),p_salon,v_staff,((case when m=13 then p_anchor-1 else (v_start+make_interval(months=>m+1))::date-1 end)+time '19:00') at time zone 'America/New_York','commission',v_price,'other',p_owner);
   end if;
  end loop;
 end loop;
 -- Useful appointments on the current day and over the next two weeks.
 for j in 0..55 loop
  v_at=(p_anchor+j/4+make_time(case when j%4<2 then 9 else 14 end,0,0)) at time zone 'America/New_York';
  v_staff=gc_private.demo_record_id(p_salon,'staff',1+j%6);v_style=gc_private.demo_record_id(p_salon,'service',2);
  v_booking=gc_private.demo_record_id(p_salon,'upcoming',j);v_client=gc_private.demo_record_id(p_salon,'client',j+1);
  insert into public.bookings(id,salon_id,customer_id,stylist_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,deposit_status,balance_due,status,source,payment_mode,created_at,client_notes,subtotal_before_promotion,original_deposit_amount,deposit_percentage,deposit_rule_snapshot)
  values(v_booking,p_salon,v_client,v_staff,v_style,v_first[1+j%24]||' '||v_last[1+j/24],(select email from auth.users where id=v_client),v_at,2,95,19,'Paid',76,'Confirmed','sample','test',p_anchor-interval '3 days','Consultation and scalp care included.',95,19,20,jsonb_build_object('version',v_deposit_id,'basis','eligible_service_subtotal_before_discounts','subtotal',95,'deposit',19,'rate',20));
  insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
  values(gc_private.demo_record_id(p_salon,'upcoming-deposit',j),p_salon,v_booking,p_anchor-interval '3 days','deposit','other',1900,'Appointment deposit',p_owner);
  insert into public.booking_messages(id,booking_id,salon_id,sender_user_id,sender_role,body,original_body,created_at,source_locale)
  values(gc_private.demo_record_id(p_salon,'message',j),v_booking,p_salon,v_client,'customer','I would like a natural finish, please.','I would like a natural finish, please.',p_anchor-interval '2 days','en'),
   (gc_private.demo_record_id(p_salon,'reply',j),v_booking,p_salon,p_owner,'salon','Noted. We can review the style together at your appointment.','Noted. We can review the style together at your appointment.',p_anchor-interval '1 day','en');
 end loop;
 -- Rescheduling the original record retains its authoritative schedule revision.
 update public.bookings set appointment_datetime=appointment_datetime+interval '1 hour',client_notes='Moved from 09:00 to 10:00 at the client’s request.' where id=gc_private.demo_record_id(p_salon,'upcoming',1);
 for i in 1..3 loop
  insert into public.appointment_waitlist(id,salon_id,customer_id,style_id,starts_after,starts_before,locale,next_check_at)
  values(gc_private.demo_record_id(p_salon,'waitlist',i),p_salon,gc_private.demo_record_id(p_salon,'client',20+i),gc_private.demo_record_id(p_salon,'service',i),p_anchor+interval '1 day',p_anchor+interval '8 days','en','2099-01-01');
 end loop;
 for i in 1..480 loop
  insert into public.business_communication_preferences(salon_id,customer_id,email_enabled,sms_enabled,push_enabled,reminders,follow_up,marketing,locale)
  values(p_salon,gc_private.demo_record_id(p_salon,'client',i),false,false,false,true,i%2=0,false,'en');
 end loop;
 insert into public.salon_blockouts(id,salon_id,stylist_id,starts_at,ends_at,reason,created_by_user_id)
 values(gc_private.demo_record_id(p_salon,'break',1),p_salon,gc_private.demo_record_id(p_salon,'staff',1),(p_anchor+time '13:00')at time zone 'America/New_York',(p_anchor+time '13:30')at time zone 'America/New_York','Lunch break',p_owner),
 (gc_private.demo_record_id(p_salon,'closure',1),p_salon,null,(p_anchor+15+time '09:00')at time zone 'America/New_York',(p_anchor+15+time '20:00')at time zone 'America/New_York','Team training day',p_owner);
 insert into public.salon_promotions(id,salon_id,title,description,discount_label,starts_at,ends_at,promotion_type,discount_value,status,is_active,target_scope)
 values(gc_private.demo_record_id(p_salon,'promotion',1),p_salon,'Fresh Style Offer','Save 10% on your next style. The booking deposit stays unchanged.','10% off',v_start,p_anchor+interval '30 days','percentage',10,'Active',true,'salon'),
 (gc_private.demo_record_id(p_salon,'promotion',2),p_salon,'Care Routine Offer','Save $5 on your next care purchase.','$5 off',p_anchor,p_anchor+interval '30 days','fixed',5,'Draft',false,'products');
 insert into public.notifications(id,user_id,salon_id,channel,title,body,delivery_status,recipient_role,category,action_url)
 values(gc_private.demo_record_id(p_salon,'notice',1),p_owner,p_salon,'in_app','Your business at a glance','Review today’s appointments, stock and client messages.','delivered','salon','general','/salon/dashboard');
 -- Stock history uses the actual dated internal sale, not the provisioning time.
 update public.business_stock_movements m set created_at=s.occurred_at from public.business_finance_sales s where m.salon_id=p_salon and s.salon_id=p_salon and m.sale_id=s.id;
 update public.business_stock_movements set created_at=v_start where salon_id=p_salon and reason='opening';
 update gc_private.demo_workspaces set seeded_at=now(),anchor_date=p_anchor,seed_version=2 where salon_id=p_salon;
 select count(*) into v_count from public.bookings where salon_id=p_salon;
 return jsonb_build_object('sample',true,'salon_id',p_salon,'months',14,'bookings',v_count,'photos',jsonb_array_length(v_photos));
end;$$;
revoke all on function public.seed_private_demo(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.seed_private_demo(uuid,uuid,date) to service_role;

-- No secret, email address or client details are returned by this service-only check.
create or replace function public.check_private_demo(p_salon uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,gc_private as $$
declare w gc_private.demo_workspaces%rowtype;checks jsonb;
begin
 select * into w from gc_private.demo_workspaces where salon_id=p_salon;
 if not found or not exists(select 1 from public.salons where id=p_salon and is_demo and user_id=w.owner_id) then raise exception 'DEMO_WORKSPACE_REQUIRED';end if;
 checks=jsonb_build_object(
  'private',exists(select 1 from public.salons where id=p_salon and not is_discoverable and not accepting_bookings and stripe_account_id is null),
  'sample_markers',not exists(select 1 from public.bookings where salon_id=p_salon and not is_demo),
  'saved_booking_terms',not exists(select 1 from public.bookings where salon_id=p_salon and booking_origin='marketplace' and
   (deposit_rule_snapshot is null or deposit_percentage<>20 or original_deposit_amount is distinct from deposit_amount or subtotal_before_promotion is distinct from estimated_total+coalesce(promotion_discount_amount,0)
    or (deposit_rule_snapshot->>'deposit')::numeric is distinct from deposit_amount or (deposit_rule_snapshot->>'subtotal')::numeric is distinct from subtotal_before_promotion or round(subtotal_before_promotion*0.2,2) is distinct from deposit_amount)),
  'team_schedules',not exists(select 1 from public.stylists where salon_id=p_salon and archived_at is null and not(availability ?& array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])),
  'no_provider_payment',not exists(select 1 from public.bookings where salon_id=p_salon and (payment_mode<>'test' or stripe_charge_id is not null or stripe_payment_id is not null)),
  'booking_scope',not exists(select 1 from public.bookings b join public.styles s on s.id=b.style_id join public.stylists t on t.id=b.stylist_id where b.salon_id=p_salon and (s.salon_id<>p_salon or t.salon_id<>p_salon)),
  'completed_booking_receipts',not exists(select 1 from public.bookings b where b.salon_id=p_salon and b.status='Completed' and b.booking_origin='marketplace'
    and round(b.estimated_total*100)<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.booking_id=b.id)),
  'cancelled_deposits_returned',not exists(select 1 from public.bookings b where b.salon_id=p_salon and b.status='Cancelled'
    and 0<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.booking_id=b.id)),
  'manual_sales_paid',not exists(select 1 from public.business_finance_sales s where s.salon_id=p_salon and s.agreed_cents<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.sale_id=s.id)),
  'stock_reconciled',not exists(select 1 from public.salon_products p where p.salon_id=p_salon and (p.inventory_quantity<>(select m.after_quantity from public.business_stock_movements m where m.salon_id=p_salon and m.product_id=p.id order by m.revision desc limit 1)
    or p.inventory_quantity<>(select m.after_quantity from public.business_stock_movements m where m.salon_id=p_salon and m.product_id=p.id and m.reason='opening')-(select coalesce(sum(quantity),0) from public.business_finance_sales s where s.salon_id=p_salon and s.product_id=p.id))),
  'communication_disabled',not exists(select 1 from public.business_communication_preferences where salon_id=p_salon and (email_enabled or sms_enabled or push_enabled or marketing)),
  'no_external_notifications',not exists(select 1 from public.notifications where salon_id=p_salon and channel<>'in_app'),
  'no_provider_connections',not exists(select 1 from public.business_google_connections where salon_id=p_salon) and not exists(select 1 from public.business_instagram_connections where salon_id=p_salon),
  'commission_reconciled',not exists(
   select 1 from public.stylists t where t.salon_id=p_salon and
   (select coalesce(sum(round(b.estimated_total*100*(b.operating_compensation->>'percent')::numeric/100)),0) from public.bookings b where b.salon_id=p_salon and b.stylist_id=t.id and b.status='Completed')
    +(select coalesce(sum(round(s.agreed_cents*(s.compensation->>'percent')::numeric/100)),0) from public.business_finance_sales s where s.salon_id=p_salon and s.stylist_id=t.id and s.kind='service')
    <>(select coalesce(sum(p.amount_cents),0) from public.business_compensation_payments p where p.salon_id=p_salon and p.stylist_id=t.id and p.kind='commission')),
  'capacity_respected',not exists(select 1 from public.bookings a join public.bookings b on b.salon_id=a.salon_id and b.stylist_id=a.stylist_id and b.id>a.id where a.salon_id=p_salon and a.status<>'Cancelled' and b.status<>'Cancelled' and a.appointment_datetime<b.appointment_datetime+(b.duration_hours*60+15)*interval '1 minute' and b.appointment_datetime<a.appointment_datetime+(a.duration_hours*60+15)*interval '1 minute'),
  'subscription_simulated',exists(select 1 from public.subscriptions where salon_id=p_salon and stripe_subscription_id is null and status='active')
 );
 return jsonb_build_object('sample',true,'checks',checks,'passed',not exists(select 1 from jsonb_each(checks)where value<>'true'::jsonb),
  'counts',jsonb_build_object('bookings',(select count(*) from public.bookings where salon_id=p_salon),'services',(select count(*) from public.styles where salon_id=p_salon),
   'products',(select count(*) from public.salon_products where salon_id=p_salon),'clients',(select count(*) from public.business_client_cards where salon_id=p_salon),
   'messages',(select count(*) from public.booking_messages where salon_id=p_salon),'reviews',(select count(*) from public.reviews where salon_id=p_salon)));
end;$$;
revoke all on function public.check_private_demo(uuid) from public,anon,authenticated;
grant execute on function public.check_private_demo(uuid) to service_role;

-- Owner/staff-scoped readback of canonical receipts, never a provider charge.
create or replace function public.read_private_booking_balances(p_salon uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gc_private as $$
declare v_stylist uuid;result jsonb;
begin
 if not exists(select 1 from public.salons s join gc_private.demo_workspaces w on w.salon_id=s.id where s.id=p_salon and s.is_demo)
   or not public.p0_actor_has_permission(p_salon,p_user,'bookings') then raise exception 'BOOKING_RECEIPT_ACCESS_DENIED';end if;
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_user) then
  select stylist_id into v_stylist from public.salon_team_members where salon_id=p_salon and user_id=p_user and status='Active';
  if v_stylist is null then raise exception 'BOOKING_RECEIPT_ACCESS_DENIED';end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into result from (
  select b.id,b.salon_id,case when b.status in ('Cancelled','No Show') then 0 else greatest(0,round(b.estimated_total*100)-coalesce(sum(case when r.stage='refund' then 0 else r.amount_cents end),0)) end as remaining_cents
  from public.bookings b left join public.business_finance_receipts r on r.salon_id=b.salon_id and r.booking_id=b.id
  where b.salon_id=p_salon and b.is_demo and b.payment_mode='test' and b.booking_origin='marketplace' and (v_stylist is null or b.stylist_id=v_stylist)
  group by b.id
 ) x;
 return result;
end;$$;
revoke all on function public.read_private_booking_balances(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_private_booking_balances(uuid,uuid) to service_role;
update public.engine_settings set published_value='"20260924164000"',draft_value='"20260924164000"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
