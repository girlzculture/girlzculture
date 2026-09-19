--185: register one existing-permission, read-only business settings tool.
-- No grants, preference writes or customer data reads. The existing dashboard
-- settings permission is registered for audit rows; no actor receives a grant.
begin;
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_permission_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_permission_check check(permission in ('settings','finance_log','finance_manage','client_history','overview','bookings','availability','my_page','photos','styles','stylists','products','reviews','promotions','earnings'));
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check(tool in ('get_business_settings','prepare_booking_reschedule_proposal','get_outstanding_balances','get_manual_sale_options','prepare_manual_service_sale','get_client_record','get_business_media','search_platform_knowledge','get_business_summary','get_bookings','get_availability','get_business_profile','get_services_and_prices','get_business_policies','get_customers','get_professionals','get_products','get_booking_messages','get_reviews','get_promotions','get_plan_status','get_profile_completion','get_earnings_summary','get_upcoming_appointments','get_calendar_gaps','prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation','prepare_business_hours','prepare_service_edit','prepare_professional_draft','prepare_product_draft','prepare_promotion_draft','prepare_booking_note','prepare_business_profile_update','prepare_availability_block','prepare_service','prepare_customer_message','prepare_business_policy_update'));
update public.engine_settings set published_value='"20260919134859"'::jsonb,draft_value='"20260919134859"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
