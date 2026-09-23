import type {ToolSchema} from '@/lib/gcAssistantCore';
const integer=(minimum:number,maximum:number):ToolSchema=>({type:'integer',minimum,maximum});
const rate:ToolSchema={type:'number',minimum:0,maximum:100};
const ids:ToolSchema={type:'array',maxItems:100,items:{type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'}};
export const ASSISTANT_CONTROLS={
 profile:{name:{type:'string',minLength:1,maxLength:120},phone:{type:'string',maxLength:40},languages:{type:'array',maxItems:5,items:{type:'string',minLength:1,maxLength:50}}},
 notifications:{reviews:{type:'boolean'},marketing:{type:'boolean'}},
 booking:{slot_minutes:{type:'integer',enum:[15,30,60]},buffer_minutes:{type:'integer',enum:[0,15,30,45,60]}},
 location:{home_address_public:{type:'boolean'},public_neighborhood:{type:'string',maxLength:120},offers_mobile:{type:'boolean'},travel_radius_miles:{type:['number','null'],minimum:1,maximum:100},travel_fee_cents:integer(0,100000)},
 deposits:{rate,threshold_amount:{type:['number','null'],minimum:0,maximum:10000},threshold_rate:{...rate,type:['number','null']},repeat_incident_count:{...integer(1,100),type:['integer','null']},repeat_incident_rate:{...rate,type:['number','null']},incident_window_days:integer(1,730)},
 growth:{reminder_hours:{type:['array','null'],maxItems:6,items:integer(1,336)},waitlist_service_ids:ids,waitlist_professional_ids:ids},
 rebooking:{enabled:{type:'boolean'},absence_days:integer(30,180),minimum_visits:integer(1,20),service_ids:ids},
} satisfies Record<string,Record<string,ToolSchema>>;
export type AssistantControl=keyof typeof ASSISTANT_CONTROLS;
