begin;

-- A conversational business operator needs more than the original 25 calls
-- shared across every business each day. Keep the founder-approved $25 monthly
-- cap, per-user burst control, provider/model allowlist and kill switch intact;
-- only remove the premature global daily exhaustion boundary.
do $$
declare
  changed_count integer;
begin
  update public.ai_automation_features
  set daily_request_limit = 500,
      description = 'Conversational owner assistant grounded in authorized business records, published Girlz Culture knowledge, and confirmation-controlled tools.',
      updated_by = null,
      updated_at = now()
  where feature_key = 'gc_owner_assistant'
    and monthly_budget_cents = 2500
    and provider_key = 'openai'
    and model_key = 'gpt-5.4-nano';

  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'GC_ASSISTANT_PILOT_CONFIGURATION_MISMATCH';
  end if;
end $$;

alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check(tool in ('search_platform_knowledge','get_business_summary','get_bookings','get_availability','get_business_profile','get_services_and_prices','get_business_policies','get_customers','get_professionals','get_products','get_booking_messages','get_reviews','get_promotions','get_plan_status','get_profile_completion','get_earnings_summary','get_upcoming_appointments','get_calendar_gaps','prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation','prepare_business_hours','prepare_service_edit','prepare_professional_draft','prepare_product_draft','prepare_promotion_draft','prepare_booking_note','prepare_business_profile_update','prepare_availability_block','prepare_service','prepare_customer_message','prepare_business_policy_update'));

commit;
