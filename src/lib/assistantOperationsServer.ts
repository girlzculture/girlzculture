import {matchBusinessCatalog} from "@/lib/businessCatalogSearch";
import "server-only";
import type {requireSalonOwner} from "@/lib/supabaseAdmin";
import {operationTool} from "@/lib/assistantOperations";
import {AssistantError,validateTool} from "@/lib/gcAssistantCore";
import {moderatePublicContent} from "@/lib/contentModerationServer";
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
type Row=Record<string,unknown>;
async function call(context:Context,name:string,args:Row){
 const result=await context.admin.rpc(name,{p_salon:context.salon.id,p_actor:context.user.id,...args});
 if(result.error){const code=String(result.error.message).match(/^ASSISTANT_[A-Z_]+$/)?.[0];if(code)throw new AssistantError(code,code.includes("ACCESS")?403:409);throw result.error;}
 if(!result.data||result.data.salon_id!==context.salon.id)throw new AssistantError("ASSISTANT_ACCESS_DENIED",403);
 return result.data;
}
export async function readAssistantStock(context:Context,args:Row){
 const data=await call(context,"read_gc_business_stock",{});
 const products=Array.isArray(data.products)?data.products:[],supplies=Array.isArray(data.supplies)?data.supplies:[],all=[...products.map((row:Row)=>({...row,kind:"product"})),...supplies.map((row:Row)=>({...row,kind:"supply"}))];
 const matching=String(args.query||"").trim()?matchBusinessCatalog(all,String(args.query)).map(match=>match.record):all;
 return {products:matching.filter(row=>row.kind==="product").slice(0,30),supplies:matching.filter(row=>row.kind==="supply").slice(0,30),inventory_total:all.length,matching_total:matching.length,query:args.query||"",capped_per_kind:30};
}
export async function prepareAssistantOperation(context:Context,input:Row){
 const {args}=validateTool(operationTool(input.operation),input);
 // Resolve own-business record and field permissions before sending any prose
 // to moderation. The model never supplies a tenant or backend function name.
 const data=await call(context,"preview_gc_business_operation",{p_args:args});
 if(!data.before||!data.payload)throw new AssistantError("ASSISTANT_INVALID_INPUT");
 const changes=JSON.parse(String(args.changes_json));
 if(args.operation==="photo_details"||args.operation==="review_reply"){
  const moderation=await moderatePublicContent(context.admin,{body:args.operation==="review_reply"?changes.reply:changes.title+"\n"+changes.caption});
  if(moderation.outcome!=="allow")throw new AssistantError("ASSISTANT_CONTENT_REVIEW_REQUIRED",409);
 }
 return {before:data.before as Row,payload:data.payload as Row,notices:[]};
}
