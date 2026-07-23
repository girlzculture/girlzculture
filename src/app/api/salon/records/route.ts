import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireSalonPermission } from "@/lib/supabaseAdmin";

const allowed={styles:{permission:"styles",label:"service"},stylists:{permission:"stylists",label:"stylist"},salon_products:{permission:"products",label:"product"},salon_promotions:{permission:"promotions",label:"promotion"},salon_blockouts:{permission:"availability",label:"blocked time"}} as const;

async function GETHandler(request:Request){
  let admin;
  let salonId:string|null=null;
  try{
    const search=new URL(request.url).searchParams;
    const table=cleanText(search.get("table"),50);
    if(table!=="style_materials")return Response.json({error:"Choose a supported salon record type."},{status:400});
    const styleId=cleanText(search.get("style_id"),60);
    if(!/^[0-9a-f-]{36}$/i.test(styleId))return Response.json({error:"Choose a valid service."},{status:400});
    const context=await requireSalonPermission(request,"styles");
    admin=context.admin;salonId=context.salon.id;
    const style=await admin.from("styles").select("id").eq("id",styleId).eq("salon_id",salonId).maybeSingle();
    if(style.error)throw style.error;
    if(!style.data)return Response.json({error:"The service was not found in this salon."},{status:404});
    const result=await admin.from("style_materials").select("*").eq("style_id",styleId).order("created_at");
    if(result.error)throw result.error;
    return Response.json({records:result.data||[]},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return monitoredRouteFailure({request,admin,error,feature:"salon-dashboard",action:"load-style-materials",actorRole:"salon",salonId,safeMessage:"We couldn't load the service materials."});
  }
}

async function POSTHandler(request:Request){
  try{
    const body=await request.json() as Record<string,unknown>;const table=cleanText(body.table,50) as keyof typeof allowed;const id=cleanText(body.id,60);const config=allowed[table];if(!config||!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:"Choose a valid salon record."},{status:400});
    const{admin,user,salon}=await requireSalonPermission(request,config.permission);const{data:record,error:readError}=await admin.from(table).select("*").eq("id",id).eq("salon_id",salon.id).maybeSingle();if(readError)throw readError;if(!record)return Response.json({error:`The ${config.label} was not found in this salon.`},{status:404});
    const name=String(record.name||record.title||record.reason||config.label);let dependencySummary:Record<string,unknown>={};let action="Deleted";let after:Record<string,unknown>|null=null;
    if(table==="styles"||table==="stylists"){
      const column=table==="styles"?"style_id":"stylist_id";const{count,error}=await admin.from("bookings").select("*",{count:"exact",head:true}).eq(column,id);if(error)throw error;dependencySummary={bookings:count||0};
      if((count||0)>0){const result=await admin.from(table).update({archived_at:new Date().toISOString()}).eq("id",id).eq("salon_id",salon.id).select().single();if(result.error)throw result.error;after=result.data;action="Archived";}else{const result=await admin.from(table).delete().eq("id",id).eq("salon_id",salon.id);if(result.error)throw result.error;}
    }else if(table==="salon_products"){const result=await admin.from(table).update({is_visible:false,archived_at:new Date().toISOString()}).eq("id",id).eq("salon_id",salon.id).select().single();if(result.error)throw result.error;after=result.data;action="Archived";}
    else if(table==="salon_promotions"){
      const linked=await admin.from("bookings").select("id",{count:"exact",head:true}).eq("salon_promotion_id",id);
      if(linked.error)throw linked.error;
      dependencySummary={bookings:linked.count||0};
      if((linked.count||0)>0){const result=await admin.from(table).update({status:"Archived",is_active:false,archived_at:new Date().toISOString()}).eq("id",id).eq("salon_id",salon.id).select().single();if(result.error)throw result.error;after=result.data;action="Archived";}
      else{const result=await admin.from(table).delete().eq("id",id).eq("salon_id",salon.id);if(result.error)throw result.error;}
    }
    else{const result=await admin.from(table).delete().eq("id",id).eq("salon_id",salon.id);if(result.error)throw result.error;}
    await admin.from("record_management_events").insert({record_type:table,record_id:id,record_label:name,action,dependency_summary:dependencySummary,before_values:record,after_values:after,reason:cleanText(body.reason,300)||"Removed from salon dashboard",acting_user_id:user.id,acting_scope:"salon_owner"});
    return Response.json({ok:true,action:action.toLowerCase(),message:action==="Archived"?`This ${config.label} has history, so it was hidden and archived safely.`:`The ${config.label} was removed.`});
  }catch(error){noteOperationalFailure("Salon record management failed",error);return errorResponse(error,"The record could not be changed safely. Nothing was removed.");}
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/records", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/records", "POST"), POSTHandler);
