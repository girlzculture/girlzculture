-- Explicit, service-only, atomic reset of a registered sample tenant. Identity,
-- password and the private tenant are retained. No production customer is selected.
create or replace function public.reset_private_demo(p_salon uuid,p_owner uuid,p_expected_seeded_at timestamptz,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,gc_private as $$
declare w gc_private.demo_workspaces%rowtype;t text;result jsonb;
begin
 select * into w from gc_private.demo_workspaces where salon_id=p_salon and owner_id=p_owner for update;
 if not found or not exists(select 1 from public.salons where id=p_salon and user_id=p_owner and is_demo) or not gc_private.demo_actor(p_owner) then raise exception 'DEMO_WORKSPACE_REQUIRED';end if;
 if p_confirmation is distinct from 'RESET PRIVATE DEMO' or p_expected_seeded_at is null or w.seeded_at is distinct from p_expected_seeded_at then raise exception 'DEMO_RESET_CONFIRMATION_REQUIRED';end if;
 -- An unexpected real provider artifact is a hard stop, never deleted to make reset work.
 if exists(select 1 from public.bookings where salon_id=p_salon and (not is_demo or stripe_payment_id is not null or stripe_charge_id is not null))
  or exists(select 1 from public.product_orders where salon_id=p_salon and (not is_demo or stripe_payment_intent_id is not null)) then raise exception 'DEMO_RESET_EXTERNAL_RECORD';end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 if to_regclass('public.gc_assistant_active_tasks') is not null then
  execute 'delete from public.gc_assistant_active_tasks where salon_id=$1' using p_salon;
 end if;
 delete from public.business_customer_campaign_recipients where campaign_id in(select id from public.business_customer_campaigns where salon_id=p_salon);
 delete from public.booking_audit_log where booking_id in(select id from public.bookings where salon_id=p_salon and is_demo);
 -- Ordered children first. Every operation is bound to this guarded tenant.
 foreach t in array array[
  'gc_assistant_memory','gc_assistant_requests','business_client_events','business_client_photos','business_client_formulas','business_client_visit_links','business_client_link_events','business_client_link_state','business_client_cards',
  'business_finance_receipts','business_compensation_payments','business_compensation_obligations','business_compensation_arrangements','business_stock_movements','business_finance_sales','business_finance_expenses','business_finance_operations','business_stock_operations',
  'business_customer_campaigns','business_communication_preferences','appointment_waitlist','reviews','notifications',
  'booking_refund_operations','salon_recovery_balances','booking_financial_events','salon_payout_attempts','product_order_refunds','product_orders','bookings',
  'salon_blockouts','salon_promotions','salon_products','business_supplies','salon_team_members','stylists','styles','subscription_change_requests','subscriptions','billing_events'] loop
  execute format('delete from public.%I where salon_id=$1',t) using p_salon;
 end loop;
 -- Retain published policy history and private auth accounts; idempotent seed reuses them.
 update gc_private.demo_workspaces set seeded_at=null where salon_id=p_salon;
 result=public.seed_private_demo(p_salon,p_owner,current_date);
 if (public.check_private_demo(p_salon)->>'passed')::boolean is distinct from true then raise exception 'DEMO_RESET_RECONCILIATION_FAILED';end if;
 return result||jsonb_build_object('reset',true,'reconciled',true);
end;$$;
revoke all on function public.reset_private_demo(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.reset_private_demo(uuid,uuid,timestamptz,text) to service_role;
