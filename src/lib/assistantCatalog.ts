import type {ToolSchema} from "@/lib/gcAssistantCore";
const text=(maxLength:number):ToolSchema=>({type:"string",maxLength});
const flag:ToolSchema={type:"boolean"};
const num=(minimum=0,maximum=100000):ToolSchema=>({type:"number",minimum,maximum});
const uuid:ToolSchema={type:"string",pattern:"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"};
const list=(items:ToolSchema,maxItems=30):ToolSchema=>({type:"array",items,maxItems});
const choice=(...values:string[]):ToolSchema=>({type:"string",enum:values});
const patch=(properties:Record<string,ToolSchema>):ToolSchema=>({type:"object",properties,required:[],additionalProperties:false});
export const ASSISTANT_CATALOG={
 prepare_service_change:{permission:"styles",table:"styles",schema:patch({name:text(120),description:text(1000),master_style_id:uuid,base_price:num(),price_display_min:num(),price_display_max:num(),duration_min_hours:num(0.25,24),duration_max_hours:num(0.25,24),buffer_minutes:{type:"integer",minimum:0,maximum:180},is_draft:flag,is_featured:flag})},
 prepare_professional_change:{permission:"stylists",table:"stylists",schema:patch({name:text(120),bio:text(500),specialties:list(text(80),20),years_experience:num(0,70),is_draft:flag,assigned_service_ids:{...list(uuid,1000),type:["array","null"]}})},
 prepare_product_change:{permission:"products",table:"salon_products",schema:patch({name:text(120),description:text(1000),price:num(),sale_price:{...num(),type:["number","null"]},sku:{...text(80),type:["string","null"]},is_visible:flag,in_person_only:flag,product_status:choice("Draft","Active","Archived"),pickup_enabled:flag,pickup_prep_minutes:{type:"integer",minimum:0,maximum:43200},shipping_enabled:flag,shipping_price:num(),shipping_profile:{...text(120),type:["string","null"]},weight_ounces:{...num(0.01,100000),type:["number","null"]},max_quantity_per_order:{type:"integer",minimum:1,maximum:1000}})},
 prepare_promotion_change:{permission:"promotions",table:"salon_promotions",schema:patch({title:text(160),description:text(1000),public_headline:text(160),promotion_type:choice("percentage","fixed","descriptive"),discount_value:num(),discount_label:text(80),starts_at:text(40),ends_at:text(40),timezone:text(80),status:choice("Draft","Active","Paused","Archived"),target_scope:choice("salon","services","products"),target_ids:list(uuid,100)})},
} as const;
export type AssistantCatalogTool=keyof typeof ASSISTANT_CATALOG;
export function isCatalogTool(tool:string):tool is AssistantCatalogTool{return Object.hasOwn(ASSISTANT_CATALOG,tool);}
