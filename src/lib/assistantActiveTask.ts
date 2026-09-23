import {ASSISTANT_TOOLS,AssistantError,type AssistantTool} from '@/lib/gcAssistantCore';

export type AssistantActiveTask={id:string;tool:AssistantTool;permission:string;revision:number;user_context:{request_id:string;text:string}[];request_ids:string[]};
export function isActionTool(tool:unknown):tool is AssistantTool{return typeof tool==='string'&&Object.hasOwn(ASSISTANT_TOOLS,tool)&&ASSISTANT_TOOLS[tool as AssistantTool].risk>=3;}
// Read dependencies are explicit. An unfinished booking cannot silently turn
// into finance, marketing or another write because the provider changed topics.
const reads:Partial<Record<AssistantTool,readonly AssistantTool[]>>={
 prepare_manual_appointment:['get_services_and_prices','get_professionals','get_availability','get_calendar_gaps','get_bookings'],
 prepare_manual_reschedule:['get_bookings','get_availability','get_calendar_gaps','get_services_and_prices','get_professionals'],
 prepare_booking_reschedule_proposal:['get_bookings','get_availability','get_calendar_gaps','get_services_and_prices','get_professionals'],
 prepare_manual_cancellation:['get_bookings'],prepare_booking_note:['get_bookings'],
 prepare_finance_record:['get_finance_records','get_earnings_summary','get_bookings'],
 prepare_manual_service_sale:['get_manual_sale_options','get_services_and_prices','get_professionals'],
 prepare_business_hours:['get_business_profile','get_business_settings'],
 prepare_availability_block:['get_business_profile','get_bookings','get_professionals','get_availability','get_calendar_gaps'],
 prepare_service:['get_services_and_prices','get_business_profile'],prepare_service_edit:['get_services_and_prices','get_business_profile'],
 prepare_professional_draft:['get_professionals','get_services_and_prices'],prepare_professional_archive:['get_professionals','get_bookings'],
 prepare_product_draft:['get_products'],prepare_promotion_draft:['get_promotions','get_services_and_prices','get_products'],
 prepare_customer_message:['get_bookings','get_booking_messages'],
 prepare_business_policy_update:['get_business_policies'],prepare_business_profile_update:['get_business_profile','get_business_settings','get_business_media'],
};
export function continuesActiveTask(active:AssistantActiveTask|null,planned:{task_tool?:AssistantTool|null;plan?:{tool:string}|null;navigate?:string|null}){
 if(!active)return true;
 if(planned.navigate||planned.task_tool!==active.tool)return false;
 return !planned.plan||planned.plan.tool===active.tool||Boolean(reads[active.tool]?.includes(planned.plan.tool as AssistantTool));
}
export function taskSummary(task:AssistantActiveTask|null){return task?{id:task.id,tool:task.tool,revision:task.revision,label:task.user_context[0]?.text||''}:null;}
export function checkedTaskTool(value:unknown){if(value===null)return null;if(!isActionTool(value))throw new AssistantError('ASSISTANT_INVALID_PLAN',502);return value;}
