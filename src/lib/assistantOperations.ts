import type {ToolSchema} from "@/lib/gcAssistantCore";
const text=(maxLength=120,minLength=0):ToolSchema=>({type:"string",maxLength,minLength});
const integer=(minimum=0,maximum=1000000):ToolSchema=>({type:"integer",minimum,maximum});
const object=(properties:Record<string,ToolSchema>,required=Object.keys(properties)):ToolSchema=>({type:"object",properties,required,additionalProperties:false});
const locale:ToolSchema={type:"string",enum:["en","fr","es","zh-CN"]};
const choice=(...values:string[]):ToolSchema=>({type:"string",enum:values});
const stock={kind:choice("product","supply"),quantity:integer(),note:text(1200,1)};
export const ASSISTANT_OPERATIONS={
 product_fulfillment:{permission:"products",schema:object({fulfillment_status:choice("Preparing","Ready for Pickup","Shipped","Delivered","Ready for pickup","Collected","Not collected"),carrier:{...text(80),type:["string","null"]},tracking_number:{...text(120),type:["string","null"]},note:{...text(500),type:["string","null"]}})},
 stock_restock:{permission:"products",schema:object({...stock,cost_cents:integer(0,100000000)})},
 stock_correction:{permission:"products",schema:object(stock)},
 stock_consumption:{permission:"products",schema:object(stock)},
 stock_settings:{permission:"products",schema:object({kind:choice("product","supply"),track_inventory:{type:"boolean"},low_stock_threshold:integer(),note:text(1200,1)})},
 supply_create:{permission:"products",schema:object({name:text(120,1),unit:text(40,1),quantity:integer(),low_stock_threshold:integer(),note:text(1200,1)})},
 supply_archive:{permission:"products",schema:object({note:text(1200,1)})},
 photo_details:{permission:"photos",schema:object({url:text(2048,1),category:choice("services","before_after","space","team","client_love","other"),title:text(120),caption:text(1000),featured:{type:"boolean"},source_locale:locale})},
 photo_cover:{permission:"photos",schema:object({url:text(2048,1)})},
 photo_remove:{permission:"photos",schema:object({url:text(2048,1)})},
 client_card:{permission:"client_history",schema:object({locale,patch:object({preferences:text(4000),notes:text(4000),cautions:text(4000),formula:object({instructions:text(4000),color:text(4000),size:text(4000),length:text(4000),technique:text(4000),duration_minutes:{type:["integer","null"],minimum:1,maximum:1440}},[])},[])})},
 review_reply:{permission:"reviews",schema:object({reply:text(2000,1)})},
} as const;
export type AssistantOperation=keyof typeof ASSISTANT_OPERATIONS;
export function operationPermission(operation:unknown){return typeof operation==="string"&&Object.hasOwn(ASSISTANT_OPERATIONS,operation)?ASSISTANT_OPERATIONS[operation as AssistantOperation].permission:null;}

export const OPERATION_TOOLS={prepare_stock_change:"products",prepare_photo_change:"photos",prepare_client_card_change:"client_history",prepare_review_reply:"reviews"} as const;
export function operationTool(operation:unknown){const permission=operationPermission(operation);return Object.entries(OPERATION_TOOLS).find(([,p])=>p===permission)?.[0] as keyof typeof OPERATION_TOOLS|undefined;}
