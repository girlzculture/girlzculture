import type {ToolSchema} from '@/lib/gcAssistantCore';
export const ASSISTANT_TEAM_PERMISSIONS=['overview','my_page','photos','styles','stylists','products','availability','bookings','reviews','earnings','earnings_own','finance_log','finance_manage','client_history','client_formulas','client_notes','client_cautions','client_photos','client_spend','client_edit','promotions','settings'] as const;
const permissionPatch:ToolSchema={type:'object',properties:Object.fromEntries(ASSISTANT_TEAM_PERMISSIONS.map(k=>[k,{type:'boolean'}])),required:[],additionalProperties:false};
export const ASSISTANT_TEAM_CHANGES={
 permissions:{type:'object',properties:{permissions:permissionPatch,status:{type:'string',enum:['Active','Inactive']}},required:[],additionalProperties:false},
 arrangement:{type:'object',properties:{effective_from:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$',maxLength:10},kind:{type:'string',enum:['commission','booth','employee','none']},basis:{type:['string','null'],enum:['before_discount','after_discount',null]},percent:{type:['number','null'],minimum:0,maximum:100},amount_cents:{type:['integer','null'],minimum:0,maximum:100000000},period:{type:['string','null'],enum:['week','month',null]}},required:['effective_from','kind','basis','percent','amount_cents','period'],additionalProperties:false},
} satisfies Record<string,ToolSchema>;
