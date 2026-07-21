import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireSalonPermission } from "@/lib/supabaseAdmin";

const allowed={styles:{permission:"styles",label:"service"},stylists:{permission:"stylists",label:"stylist"},salon_products:{permission:"products",label:"product"},salon_promotions:{permission:"promotions",label:"promotion"},salon_blockouts:{permission:"availability",label:"blocked time"}} as const;

export async function POST(request:Request){
  try{
    const body=await request.json() as Record<string,unknown>;const table=cleanText(body.table,50) as keyof typeof allowed;const id=cleanText(body.id,60);const config=allowed[table];if(!config||!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:"Choose a valid salon record."},{status:400});
    const{admin,user,salon}=await requireSalonPermission(request,config.permission);const{data:record,error:readError}=await admin.from(table).select("*").eq("id",id).eq("salon_id",salon.id).maybeSingle();if(readError)throw readError;if(!record)return Response.json({error:`The ${config.label} was not found in this salon.`},{status:404});
    const name=String(record.name||record.title||record.reason||config.label);let dependencySummary:Record<string,unknown>={};let action="Deleted";let after:Record<string,unknown>|null=null;
    if(table==="styles"||table==="stylists"){
      const column=table==="styles"?"style_id":"stylist_id";const{count,error}=await admin.from("bookings").select("*",{count:"exact",head:true}).eq(column,id);if(error)throw error;dependencySummary={bookings:count||0};
      if((count||0)>0){const result=await admin.from(table).update({archived_at:new Date().toISOString()}).eq("id",id).eq("salon_id",salon.id).select().single();if(result.error)throw result.error;after=result.data;action="Archived";}else{const result=await admin.from(table).delete().eq("id",id).eq("salon_id",salon.id);if(result.error)throw result.error;}
    }else if(table==="salon_products"){const result=await admin.from(table).update({is_visible:false,archived_at:new Date().toISOString()}).eq("id",id).eq("salon_id",salon.id).select().single();if(result.error)throw result.error;after=result.data;action="Archived";}
    else if(table==="salon_promotions"){const result=await admin.from(table).update({is_active:false,archived_at:new Date().toISOString()}).eq("id",id).eq("salon_id",salon.id).select().single();if(result.error)throw result.error;after=result.data;action="Archived";}
    else{const result=await admin.from(table).delete().eq("id",id).eq("salon_id",salon.id);if(result.error)throw result.error;}
    await admin.from("record_management_events").insert({record_type:table,record_id:id,record_label:name,action,dependency_summary:dependencySummary,before_values:record,after_values:after,reason:cleanText(body.reason,300)||"Removed from salon dashboard",acting_user_id:user.id,acting_scope:"salon_owner"});
    return Response.json({ok:true,action:action.toLowerCase(),message:action==="Archived"?`This ${config.label} has history, so it was hidden and archived safely.`:`The ${config.label} was removed.`});
  }catch(error){console.error("Salon record management failed",error);return errorResponse(error,"The record could not be changed safely. Nothing was removed.");}
}
