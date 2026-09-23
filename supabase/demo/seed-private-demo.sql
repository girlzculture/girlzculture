-- Installed only by the protected migration; invocation is a separate, explicit admin action.
create or replace function public.seed_private_demo(p_salon uuid,p_owner uuid,p_anchor date)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth,gc_private as $$
declare
 w gc_private.demo_workspaces%rowtype;v_start date;v_now timestamptz;v_day date;v_at timestamptz;
 i integer;j integer;m integer;k integer;v_style uuid;v_staff uuid;v_client uuid;v_booking uuid;v_receipt uuid;v_sale uuid;
 v_deposit_id uuid;v_price numeric;v_hours numeric;v_status text;v_plan text;v_count integer;
 v_photos jsonb='["https://girlzculture.com/images/salon-warm.jpg","https://girlzculture.com/images/salon-modern.jpg","https://girlzculture.com/images/salon-dark.jpg","https://girlzculture.com/images/salon-blush.jpg","https://girlzculture.com/images/hero-braids.jpg","https://girlzculture.com/images/braids-box.jpg","https://girlzculture.com/images/braids-cornrows.jpg","https://girlzculture.com/images/braids-knotless.jpg"]';
 v_names text[]=array['Amara Demo','Nia Demo','Zuri Demo','Imani Demo'];
 v_services text[]=array['Boho / Knotless Braids','Box Braids','Loc Retwist','Cornrows','Two-Strand Twists','Feed-in Braids'];
 v_canonical text[]=array['Knotless Braids','Box Braids','Locs','Cornrows','Two-Strand Twists','Feed-in Braids'];
 v_products text[]=array['Sample moisture shampoo','Sample leave-in conditioner','Sample scalp oil','Sample satin bonnet'];
 v_prices numeric[]=array[210,95,110,125,55,65];
 v_durations numeric[]=array[4,2,2,3,1,1];
 v_master public.master_styles%rowtype;
begin
 if p_anchor>current_date or p_anchor<current_date-31 then raise exception 'DEMO_ANCHOR_INVALID';end if;
 select * into w from gc_private.demo_workspaces where salon_id=p_salon and owner_id=p_owner for update;
 if not found or not gc_private.demo_actor(p_owner) or not exists(select 1 from public.salons where id=p_salon and user_id=p_owner and is_demo) then raise exception 'DEMO_WORKSPACE_REQUIRED';end if;
 if w.seeded_at is not null then return jsonb_build_object('already_seeded',true,'salon_id',p_salon,'anchor_date',w.anchor_date);end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 v_start=(date_trunc('month',p_anchor)-interval '13 months')::date;
 update public.salons set name='Culture House — Sample Salon',description='Private demonstration business. Every client, booking, review and financial record is fictional sample data.',
  owner_name='Demo Business Owner',operator_type='team',business_type='Hair Salon',status='Approved',application_state='Approved',approved_at=now(),
  subscription_tier='Premium',subscription_status='Active',date_joined=v_start,created_at=v_start,
  address_street='123 Sample Avenue',address_city='New York',address_state='NY',address_zip='10027',neighborhood='Harlem',
  time_zone='America/New_York',media_consent=true,onboarding_completed_at=v_start,onboarding_progress=100,
  hours='{"Sun":{"open":"09:00","close":"20:00"},"Mon":{"open":"09:00","close":"20:00"},"Tue":{"open":"09:00","close":"20:00"},"Wed":{"open":"09:00","close":"20:00"},"Thu":{"open":"09:00","close":"20:00"},"Fri":{"open":"09:00","close":"20:00"},"Sat":{"open":"09:00","close":"20:00"}}',
  cover_photo_url=v_photos->>0,gallery_photos=v_photos,phone='+12125550100'
 where id=p_salon;
 insert into public.subscriptions(id,salon_id,tier,status,billing_start,current_period_start,current_period_end)
 values(gc_private.demo_record_id(p_salon,'subscription',1),p_salon,'Premium','active',v_start,date_trunc('month',p_anchor),'2099-01-01');
 -- The same versioned deposit rule used by the real booking calculation.
 perform public.save_business_deposit_rule(p_salon,p_owner,gen_random_uuid(),
  (select id from public.business_deposit_rules where salon_id=p_salon order by created_at desc,id desc limit 1),
  '{"rate":20,"threshold_amount":null,"threshold_rate":null,"repeat_incident_count":null,"repeat_incident_rate":null,"incident_window_days":365}');
 select id into v_deposit_id from public.business_deposit_rules where salon_id=p_salon order by created_at desc,id desc limit 1;
 for i in 1..4 loop
  v_staff=gc_private.demo_record_id(p_salon,'staff',i);
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_staff,'staff'||i||'@private-demo.invalid','',now(),'{"gc_demo":true}',jsonb_build_object('role','salon_staff','name',v_names[i]),v_start,now()) on conflict(id)do nothing;
  insert into public.stylists(id,salon_id,user_id,name,slug,bio,specialties,photos,is_active,is_draft,years_experience,availability,created_at)
  values(v_staff,p_salon,v_staff,v_names[i],'sample-professional-'||i,'Fictional team member for private software demonstrations.',
   (select coalesce(jsonb_agg(name),'[]'::jsonb) from (select name from public.master_styles where is_active and archived_at is null order by name limit 3) specialties),
   jsonb_build_array(v_photos->>4),true,false,3+i,(select hours from public.salons where id=p_salon),v_start);
  insert into public.salon_team_members(id,salon_id,user_id,stylist_id,email,name,role,permissions,status,invited_by,activated_at)
  values(gc_private.demo_record_id(p_salon,'member',i),p_salon,v_staff,v_staff,'staff'||i||'@private-demo.invalid',v_names[i],case when i=1 then 'Manager' else 'Stylist' end,
  '{"overview":true,"bookings":true,"styles":true,"availability":true,"photos":true,"earnings_own":true,"finance_log":true}', 'Active',p_owner,v_start);
  insert into public.business_compensation_arrangements(id,salon_id,stylist_id,effective_from,kind,basis,percent,created_by)
  values(gc_private.demo_record_id(p_salon,'arrangement',i),p_salon,v_staff,v_start-7,'commission','after_discount',50,p_owner);
 end loop;
 for i in 1..6 loop
  select * into v_master from public.master_styles where is_active and archived_at is null and category_id is not null and service_group_id is not null and name=v_canonical[i];
  if v_master.id is null then raise exception 'DEMO_CATALOG_REQUIRED';end if;
  insert into public.styles(id,salon_id,name,category,description,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,photos,master_style_id,category_id,service_group_id,is_draft,is_featured,sort_order,created_at)
  values(gc_private.demo_record_id(p_salon,'service',i),p_salon,v_services[i],v_master.category,'Sample service. Fictional prices for a private demonstration.',v_durations[i],v_durations[i],v_prices[i],v_prices[i],v_prices[i],jsonb_build_array(v_photos->>(4+(i%4))),case when v_services[i]=v_master.name then v_master.id else null end,v_master.category_id,v_master.service_group_id,false,i<=3,i,v_start);
 end loop;
 update public.stylists set assigned_service_ids=(select array_agg(id order by sort_order) from public.styles where salon_id=p_salon) where salon_id=p_salon;
 for i in 1..4 loop
  insert into public.salon_products(id,salon_id,name,description,price,sku,inventory_quantity,track_inventory,low_stock_threshold,product_status,is_visible,pickup_enabled,shipping_enabled,created_at)
  values(gc_private.demo_record_id(p_salon,'product',i),p_salon,v_products[i],'Fictional retail product for private demonstrations; not available for real purchase.',12+i*3,'SAMPLE-'||i,60,true,10,'Active',true,true,false,v_start);
 end loop;
 for i in 1..28 loop
  v_client=gc_private.demo_record_id(p_salon,'client',i);
  insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_client,'client'||i||'@private-demo.invalid','',now(),'{"gc_demo":true}',jsonb_build_object('role','customer','name','Sample Client '||i),v_start,now()) on conflict(id)do nothing;
  insert into public.customers(id,name,email,phone,created_at) values(v_client,'Sample Client '||i,'client'||i||'@private-demo.invalid','+121255501'||lpad(i::text,2,'0'),v_start)
  on conflict(id)do update set name=excluded.name,email=excluded.email,phone=excluded.phone;
  insert into public.business_client_cards(id,salon_id,subject_key,preferences,notes,cautions,source_locale,updated_by)
  values(gc_private.demo_record_id(p_salon,'card',i),p_salon,'customer:'||v_client,'Sample preference: comfortable tension and a natural finish.','Fictional demonstration client. No external communication is permitted.','','en',p_owner);
 end loop;
 insert into public.business_policy_revisions(id,salon_id,policy,source_locale,version,created_by,published_at,published_by)
 values(gc_private.demo_record_id(p_salon,'policy',1),p_salon,'{"cancellation_hours":24,"rescheduling_hours":24,"grace_minutes":15,"no_show":"contact_business","late_arrival":"contact_business","deposit_treatment":"platform_rules","balance_due":"after_service","satisfaction":"contact_business","preparation":"SAMPLE: arrive with detangled hair unless your service includes preparation.","guests":"ask_first","children":"ask_first","walk_ins":"welcome","notes":"Private demonstration policy. No real booking or charge.","refund_satisfaction":"contact_business","refund_terms":"Discuss the result with the business.","business_policy_text":null}','en',1,p_owner,now(),p_owner) on conflict(id)do nothing;
 update public.salons set business_policy_revision_id=gc_private.demo_record_id(p_salon,'policy',1) where id=p_salon;
 for m in 0..13 loop
  for j in 1..least(36+case m%3 when 0 then 8 when 1 then -8 else 0 end,case when m=13 then 2*(extract(day from p_anchor)::integer-1) else 60 end) loop
   i=m*44+j;v_day=(v_start+make_interval(months=>m))::date+((j-1)/2);
   v_at=(v_day+make_time(case when j%2=0 then 14 else 9 end,0,0)) at time zone 'America/New_York';
   v_staff=gc_private.demo_record_id(p_salon,'staff',1+((j-1)%4));
   v_style=gc_private.demo_record_id(p_salon,'service',1+((i-1)%6));
   v_client=gc_private.demo_record_id(p_salon,'client',1+((i-1)%28));
   v_price=v_prices[1+((i-1)%6)];v_hours=v_durations[1+((i-1)%6)];
   v_status=case when v_at>p_anchor::timestamp then 'Confirmed' when i%17=0 then 'No Show' when i%11=0 then 'Cancelled' else 'Completed' end;
   v_booking=gc_private.demo_record_id(p_salon,'booking',i);
   insert into public.bookings(id,salon_id,customer_id,stylist_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,deposit_status,balance_due,status,source,payment_mode,created_at,service_completed_at,client_notes,subtotal_before_promotion,original_deposit_amount,deposit_percentage,deposit_rule_snapshot)
   values(v_booking,p_salon,v_client,v_staff,v_style,'Sample Client '||(1+((i-1)%28)), 'client'||(1+((i-1)%28))||'@private-demo.invalid',v_at,v_hours,v_price,round(v_price*0.2,2),'Paid',round(v_price*0.8,2),v_status,'sample','test',v_at-interval '7 days',case when v_status='Completed' then v_at+v_hours*interval '1 hour' else null end,'SAMPLE DATA — simulated booking and payments; no provider transaction.',v_price,round(v_price*0.2,2),20,jsonb_build_object('version',v_deposit_id,'basis','eligible_service_subtotal_before_discounts','subtotal',v_price,'deposit',round(v_price*0.2,2),'rate',20));
   v_receipt=gc_private.demo_record_id(p_salon,'deposit',i);
   insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
   values(v_receipt,p_salon,v_booking,v_at-interval '7 days','deposit','other',round(v_price*20)::bigint,'SAMPLE — simulated deposit, no real funds.',p_owner);
   if v_status='Completed' then
    insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
    values(gc_private.demo_record_id(p_salon,'balance',i),p_salon,v_booking,v_at+v_hours*interval '1 hour','balance','other',round(v_price*80)::bigint,'SAMPLE — simulated balance payment, no real funds.',p_owner);
    if i%7=0 then
     insert into public.business_client_formulas(salon_id,card_id,booking_id,formula,source_locale,updated_by)
     values(p_salon,gc_private.demo_record_id(p_salon,'card',1+((i-1)%28)),v_booking,jsonb_build_object('technique',v_services[1+((i-1)%6)],'size','Medium','length','Shoulder length','instructions','SAMPLE: light tension, protect the edges.','duration_minutes',v_hours*60),'en',p_owner);
    end if;
    if i%9=0 then
     insert into public.reviews(id,booking_id,customer_id,salon_id,stylist_id,rating_overall,written_review,display_name,moderation_status,created_at)
     values(gc_private.demo_record_id(p_salon,'review',i),v_booking,v_client,p_salon,v_staff,4+(i%2),'Sample review: a friendly visit and a carefully finished style. Invented for this private demonstration.','Sample Client '||(1+((i-1)%28)),'Published',v_at+interval '1 day');
    end if;
   elsif v_status='Cancelled' then
    insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,original_payment_id,note,created_by)
    values(gc_private.demo_record_id(p_salon,'refund',i),p_salon,v_booking,v_at-interval '1 day','refund','other',round(v_price*20)::bigint,v_receipt,'SAMPLE — simulated return of deposit, no real funds.',p_owner);
   end if;
  end loop;
  -- An ordinary private offline sale exercises the real stock and accounting pipeline.
  for k in 1..4 loop
   v_sale=gc_private.demo_record_id(p_salon,'retail',m*4+k);
   v_at=(v_start+make_interval(months=>m)+interval '8 days 16 hours') at time zone 'America/New_York';
   insert into public.business_finance_sales(id,salon_id,occurred_at,source,kind,name,product_id,list_cents,cost_cents,quantity,created_by)
   values(v_sale,p_salon,v_at,'walk_in','product',v_products[k],gc_private.demo_record_id(p_salon,'product',k),(12+k*3)*100,600+k*100,1,p_owner);
   insert into public.business_finance_receipts(id,salon_id,sale_id,occurred_at,stage,method,amount_cents,note,created_by)
   values(gc_private.demo_record_id(p_salon,'retail-receipt',m*4+k),p_salon,v_sale,v_at,'full','other',(12+k*3)*100,'SAMPLE — simulated retail payment.',p_owner);
  end loop;
  -- A walk-in is never represented as a platform-paid appointment.
  if m<13 or extract(day from p_anchor)>2 then
  v_staff=gc_private.demo_record_id(p_salon,'staff',1+m%4);
  v_at=((v_start+make_interval(months=>m))::date+(case when m=13 then least(19,extract(day from p_anchor)::integer-2) else 19 end)+time '18:30') at time zone 'America/New_York';
  insert into public.bookings(id,salon_id,style_id,stylist_id,guest_name,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,status,source,booking_origin,business_added_by,business_added_request_id,manual_service_name,business_policy_acceptance_kind,payment_mode,service_completed_at,created_at)
  values(gc_private.demo_record_id(p_salon,'walk-in',m),p_salon,gc_private.demo_record_id(p_salon,'service',5),v_staff,'Sample Walk-in '||m,v_at,1,0,0,0,'Not collected by Girlz Culture',case when v_at<p_anchor::timestamp then 'Completed' else 'Confirmed' end,'walk_in','business_added',p_owner,gc_private.demo_record_id(p_salon,'walk-in-request',m),v_services[5],'business_added_not_accepted','test',case when v_at<p_anchor::timestamp then v_at+interval '1 hour' end,v_at-interval '10 minutes');
  if v_at<p_anchor::timestamp then
   v_sale=gc_private.demo_record_id(p_salon,'walk-in-sale',m);
   insert into public.business_finance_sales(id,salon_id,occurred_at,source,kind,name,stylist_id,client_name,list_cents,compensation,created_by)
   values(v_sale,p_salon,v_at,'walk_in','service',v_services[5],v_staff,'Sample Walk-in '||m,5500,public.business_compensation_snapshot(p_salon,v_staff,v_at),p_owner);
   insert into public.business_finance_receipts(id,salon_id,sale_id,occurred_at,stage,method,amount_cents,note,created_by)
   values(gc_private.demo_record_id(p_salon,'walk-in-receipt',m),p_salon,v_sale,v_at,'full','other',5500,'SAMPLE — simulated walk-in payment.',p_owner);
  end if;
  end if;
  insert into public.business_finance_expenses(id,salon_id,occurred_at,category,amount_cents,treatment,note,created_by)
  values(gc_private.demo_record_id(p_salon,'rent',m),p_salon,v_start+make_interval(months=>m),'Rent',180000,'operating','SAMPLE — simulated monthly expense.',p_owner),
  (gc_private.demo_record_id(p_salon,'supplies',m),p_salon,v_start+make_interval(months=>m)+interval '5 days','Supplies',12500+m*100,'operating','SAMPLE — simulated consumable supplies.',p_owner);
  insert into public.billing_events(id,salon_id,salon_name,event_date,event_type,new_plan,amount_collected,payment_status,stripe_event_id,metadata)
  values(gc_private.demo_record_id(p_salon,'billing',m),p_salon,'Culture House — Sample Salon',v_start+make_interval(months=>m),'sample_subscription','Premium',199,'Simulated','gc-demo:'||p_salon||':'||m,'{"sample":true,"provider_charge":false}');
 end loop;
 -- Pay the earned sample commission through each historical month, never a provider payout.
 for m in 0..13 loop
  for k in 1..4 loop
   v_staff=gc_private.demo_record_id(p_salon,'staff',k);
   select coalesce(sum(round(b.estimated_total*100*(b.operating_compensation->>'percent')::numeric/100)),0) into v_price
    from public.bookings b where b.salon_id=p_salon and b.stylist_id=v_staff and b.status='Completed'
     and b.service_completed_at>=v_start+make_interval(months=>m) and b.service_completed_at<v_start+make_interval(months=>m+1);
   select v_price+coalesce(sum(round(agreed_cents*(compensation->>'percent')::numeric/100)),0) into v_price from public.business_finance_sales
    where salon_id=p_salon and stylist_id=v_staff and kind='service' and occurred_at>=v_start+make_interval(months=>m) and occurred_at<v_start+make_interval(months=>m+1);
   if v_price>0 then
    insert into public.business_compensation_payments(id,salon_id,stylist_id,occurred_at,kind,amount_cents,method,created_by)
    values(gc_private.demo_record_id(p_salon,'compensation',m*4+k),p_salon,v_staff,v_start+make_interval(months=>m+1)-interval '1 hour','commission',v_price,'other',p_owner);
   end if;
  end loop;
 end loop;
 -- Useful appointments on the current day and over the next two weeks.
 for j in 0..7 loop
  v_at=(p_anchor+j*2+time '10:00') at time zone 'America/New_York';
  v_staff=gc_private.demo_record_id(p_salon,'staff',1+j%4);v_style=gc_private.demo_record_id(p_salon,'service',2);
  v_booking=gc_private.demo_record_id(p_salon,'upcoming',j);v_client=gc_private.demo_record_id(p_salon,'client',j+1);
  insert into public.bookings(id,salon_id,customer_id,stylist_id,style_id,guest_name,guest_email,appointment_datetime,duration_hours,estimated_total,deposit_amount,deposit_status,balance_due,status,source,payment_mode,created_at,client_notes,subtotal_before_promotion,original_deposit_amount,deposit_percentage,deposit_rule_snapshot)
  values(v_booking,p_salon,v_client,v_staff,v_style,'Sample Client '||(j+1),'client'||(j+1)||'@private-demo.invalid',v_at,2,95,19,'Paid',76,'Confirmed','sample','test',p_anchor-interval '3 days','SAMPLE — upcoming demonstration appointment.',95,19,20,jsonb_build_object('version',v_deposit_id,'basis','eligible_service_subtotal_before_discounts','subtotal',95,'deposit',19,'rate',20));
  insert into public.business_finance_receipts(id,salon_id,booking_id,occurred_at,stage,method,amount_cents,note,created_by)
  values(gc_private.demo_record_id(p_salon,'upcoming-deposit',j),p_salon,v_booking,p_anchor-interval '3 days','deposit','other',1900,'SAMPLE — simulated deposit.',p_owner);
  insert into public.booking_messages(id,booking_id,salon_id,sender_user_id,sender_role,body,original_body,created_at,source_locale)
  values(gc_private.demo_record_id(p_salon,'message',j),v_booking,p_salon,v_client,'customer','Sample conversation: I would like a natural finish, please.','Sample conversation: I would like a natural finish, please.',p_anchor-interval '2 days','en'),
   (gc_private.demo_record_id(p_salon,'reply',j),v_booking,p_salon,p_owner,'salon','Sample reply: noted. We can review the style together at your appointment.','Sample reply: noted. We can review the style together at your appointment.',p_anchor-interval '1 day','en');
 end loop;
 -- Rescheduling the original record retains its authoritative schedule revision.
 update public.bookings set appointment_datetime=appointment_datetime+interval '1 hour',client_notes='SAMPLE — moved from 10:00 to 11:00 at the client’s request.' where id=gc_private.demo_record_id(p_salon,'upcoming',1);
 for i in 1..3 loop
  insert into public.appointment_waitlist(id,salon_id,customer_id,style_id,starts_after,starts_before,locale,next_check_at)
  values(gc_private.demo_record_id(p_salon,'waitlist',i),p_salon,gc_private.demo_record_id(p_salon,'client',20+i),gc_private.demo_record_id(p_salon,'service',i),p_anchor+interval '1 day',p_anchor+interval '8 days','en','2099-01-01');
 end loop;
 for i in 1..28 loop
  insert into public.business_communication_preferences(salon_id,customer_id,email_enabled,sms_enabled,push_enabled,reminders,follow_up,marketing,locale)
  values(p_salon,gc_private.demo_record_id(p_salon,'client',i),false,false,false,true,i%2=0,false,'en');
 end loop;
 insert into public.salon_blockouts(id,salon_id,stylist_id,starts_at,ends_at,reason,created_by_user_id)
 values(gc_private.demo_record_id(p_salon,'break',1),p_salon,gc_private.demo_record_id(p_salon,'staff',1),(p_anchor+time '13:00')at time zone 'America/New_York',(p_anchor+time '13:30')at time zone 'America/New_York','SAMPLE — lunch break',p_owner),
 (gc_private.demo_record_id(p_salon,'closure',1),p_salon,null,(p_anchor+15+time '09:00')at time zone 'America/New_York',(p_anchor+15+time '20:00')at time zone 'America/New_York','SAMPLE — team training day',p_owner);
 insert into public.salon_promotions(id,salon_id,title,description,discount_label,starts_at,ends_at,promotion_type,discount_value,status,is_active,target_scope)
 values(gc_private.demo_record_id(p_salon,'promotion',1),p_salon,'Sample first-visit offer','Private demo offer; never sent to customers.','10% off',p_anchor-interval '1 day',p_anchor+interval '30 days','percentage',10,'Active',true,'salon'),
 (gc_private.demo_record_id(p_salon,'promotion',2),p_salon,'Sample retail offer','Draft promotion for a demonstration.','$5 off',p_anchor,p_anchor+interval '30 days','fixed',5,'Draft',false,'products');
 insert into public.notifications(id,user_id,salon_id,channel,title,body,delivery_status,recipient_role,category,action_url)
 values(gc_private.demo_record_id(p_salon,'notice',1),p_owner,p_salon,'in_app','Private sample workspace','Try asking the AI Assistant about saved photos, Boho braids, today’s bookings or last month’s finances.','delivered','salon','general','/salon/dashboard');
 update gc_private.demo_workspaces set seeded_at=now(),anchor_date=p_anchor where salon_id=p_salon;
 select count(*) into v_count from public.bookings where salon_id=p_salon;
 return jsonb_build_object('sample',true,'salon_id',p_salon,'months',14,'bookings',v_count,'photos',jsonb_array_length(v_photos));
end;$$;
revoke all on function public.seed_private_demo(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.seed_private_demo(uuid,uuid,date) to service_role;
