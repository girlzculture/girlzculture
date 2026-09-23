import "server-only";
import type {requireSalonOwner} from "@/lib/supabaseAdmin";
import {ASSISTANT_CATALOG,type AssistantCatalogTool} from "@/lib/assistantCatalog";
import {AssistantError,validateTool} from "@/lib/gcAssistantCore";
import {sanitizeSalonRecord} from "@/lib/salonRecordValidation";
import {moderatePublicContent} from "@/lib/contentModerationServer";
type Row=Record<string,unknown>;
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
export async function prepareAssistantCatalog(context:Context,tool:AssistantCatalogTool,input:Row){
 const {args}=validateTool(tool,input);
 // Database scope and complete current state come before moderation or a write.
 const response=await context.admin.rpc("preview_gc_catalog_change",{p_salon:context.salon.id,p_actor:context.user.id,p_tool:tool,p_args:args});
 if(response.error){const code=String(response.error.message).match(/^ASSISTANT_[A-Z_]+$/)?.[0];if(code)throw new AssistantError(code,code.includes("ACCESS")?403:409);throw response.error;}
 const preview=response.data as {salon_id:string;before:Row;payload:Row}|null;
 if(!preview||preview.salon_id!==context.salon.id)throw new AssistantError("ASSISTANT_ACCESS_DENIED",403);
 const table=ASSISTANT_CATALOG[tool].table,values=preview.payload.values as Row;
 // Reuse the manual editor's full record validation, without accepting new
 // values returned by a model or interpreting a missing field as deletion.
 try{sanitizeSalonRecord(table,values,!args.record_id);}catch{throw new AssistantError("ASSISTANT_INVALID_INPUT");}
 const optionText=["size_options","length_options","addons"].flatMap(key=>Array.isArray(values[key])?(values[key] as Row[]).map(row=>row.label):[]);
 const materials=Array.isArray(preview.payload.materials)?preview.payload.materials as Row[]:[];
 const moderation=await moderatePublicContent(context.admin,{name:typeof values.name==="string"?values.name:undefined,title:typeof values.title==="string"?values.title:undefined,body:[values.description,values.bio,values.public_headline,values.discount_label,...(Array.isArray(values.specialties)?values.specialties:[]),...optionText,...(Array.isArray(values.included_items)?values.included_items:[]),...materials.flatMap(row=>[row.name,row.quality_grade])].filter(value=>typeof value==="string").join("\n")});
 if(moderation.outcome!=="allow")throw new AssistantError("ASSISTANT_CONTENT_REVIEW_REQUIRED",409);
 return {before:preview.before,payload:preview.payload,notices:[]};
}
