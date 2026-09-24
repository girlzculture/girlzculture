import "server-only";
import type {requireSalonOwner} from "@/lib/supabaseAdmin";
import {AssistantError} from "@/lib/gcAssistantCore";
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
type Row=Record<string,unknown>;
async function call(context:Context,name:string,args:Row){
 const result=await context.admin.rpc(name,{p_salon:context.salon.id,p_actor:context.user.id,...args});
 if(result.error){const code=String(result.error.message).match(/^ASSISTANT_[A-Z_]+$/)?.[0];if(code)throw new AssistantError(code,code.includes("ACCESS")?403:409);throw result.error;}
 if(!result.data||result.data.salon_id!==context.salon.id)throw new AssistantError("ASSISTANT_ACCESS_DENIED",403);
 return result.data;
}
export async function readAssistantFinanceRecords(context:Context,args:Row){
 const result=await call(context,"read_gc_finance_records",{p_start:args.start,p_end:args.end});
 return {records:result.records,totals:result.totals,capped_at:100,recorded_only:true,sample_data:result.sample_data};
}
export async function prepareAssistantFinanceRecord(context:Context,args:Row){
 const result=await call(context,"preview_gc_finance_record",{p_args:args});
 if(!result.before||!result.payload)throw new AssistantError("ASSISTANT_INVALID_INPUT");
 return {before:result.before as Row,payload:result.payload as Row,notices:["FINANCE_RECORD_ONLY_NO_PROVIDER_ACTION"]};
}
