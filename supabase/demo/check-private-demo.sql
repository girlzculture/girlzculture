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
   (deposit_rule_snapshot is null or deposit_percentage<>20 or original_deposit_amount is distinct from deposit_amount or subtotal_before_promotion is distinct from estimated_total
    or (deposit_rule_snapshot->>'deposit')::numeric is distinct from deposit_amount or (deposit_rule_snapshot->>'subtotal')::numeric is distinct from estimated_total or round(estimated_total*0.2,2) is distinct from deposit_amount)),
  'team_schedules',not exists(select 1 from public.stylists where salon_id=p_salon and archived_at is null and not(availability ?& array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])),
  'no_provider_payment',not exists(select 1 from public.bookings where salon_id=p_salon and (payment_mode<>'test' or stripe_charge_id is not null or stripe_payment_id is not null)),
  'booking_scope',not exists(select 1 from public.bookings b join public.styles s on s.id=b.style_id join public.stylists t on t.id=b.stylist_id where b.salon_id=p_salon and (s.salon_id<>p_salon or t.salon_id<>p_salon)),
  'completed_booking_receipts',not exists(select 1 from public.bookings b where b.salon_id=p_salon and b.status='Completed' and b.booking_origin='marketplace'
    and round(b.estimated_total*100)<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.booking_id=b.id)),
  'cancelled_deposits_returned',not exists(select 1 from public.bookings b where b.salon_id=p_salon and b.status='Cancelled'
    and 0<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.booking_id=b.id)),
  'manual_sales_paid',not exists(select 1 from public.business_finance_sales s where s.salon_id=p_salon and s.agreed_cents<>(select coalesce(sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end),0) from public.business_finance_receipts r where r.salon_id=p_salon and r.sale_id=s.id)),
  'stock_reconciled',not exists(select 1 from public.salon_products p where p.salon_id=p_salon and (p.inventory_quantity<>(select m.after_quantity from public.business_stock_movements m where m.salon_id=p_salon and m.product_id=p.id order by m.revision desc limit 1)
    or p.inventory_quantity<>60-(select coalesce(sum(quantity),0) from public.business_finance_sales s where s.salon_id=p_salon and s.product_id=p.id))),
  'communication_disabled',not exists(select 1 from public.business_communication_preferences where salon_id=p_salon and (email_enabled or sms_enabled or push_enabled or marketing)),
  'no_external_notifications',not exists(select 1 from public.notifications where salon_id=p_salon and channel<>'in_app'),
  'no_provider_connections',not exists(select 1 from public.business_google_connections where salon_id=p_salon) and not exists(select 1 from public.business_instagram_connections where salon_id=p_salon),
  'commission_reconciled',not exists(
   select 1 from public.stylists t where t.salon_id=p_salon and
   (select coalesce(sum(round(b.estimated_total*100*(b.operating_compensation->>'percent')::numeric/100)),0) from public.bookings b where b.salon_id=p_salon and b.stylist_id=t.id and b.status='Completed')
    +(select coalesce(sum(round(s.agreed_cents*(s.compensation->>'percent')::numeric/100)),0) from public.business_finance_sales s where s.salon_id=p_salon and s.stylist_id=t.id and s.kind='service')
    <>(select coalesce(sum(p.amount_cents),0) from public.business_compensation_payments p where p.salon_id=p_salon and p.stylist_id=t.id and p.kind='commission')),
  'subscription_simulated',exists(select 1 from public.subscriptions where salon_id=p_salon and stripe_subscription_id is null and status='active')
 );
 return jsonb_build_object('sample',true,'checks',checks,'passed',not exists(select 1 from jsonb_each(checks)where value<>'true'::jsonb),
  'counts',jsonb_build_object('bookings',(select count(*) from public.bookings where salon_id=p_salon),'services',(select count(*) from public.styles where salon_id=p_salon),
   'products',(select count(*) from public.salon_products where salon_id=p_salon),'clients',(select count(*) from public.business_client_cards where salon_id=p_salon),
   'messages',(select count(*) from public.booking_messages where salon_id=p_salon),'reviews',(select count(*) from public.reviews where salon_id=p_salon)));
end;$$;
revoke all on function public.check_private_demo(uuid) from public,anon,authenticated;
grant execute on function public.check_private_demo(uuid) to service_role;
