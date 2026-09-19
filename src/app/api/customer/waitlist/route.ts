import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {enforceRateLimit} from "@/lib/requestSecurity";
import {WAITLIST_UUID,waitlistFailure} from "@/lib/appointmentWaitlistServer";
import {zonedLocalToUtc} from "@/lib/dateTime";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";

async function handle(request:Request) {
 let admin:ReturnType<typeof getSupabaseAdmin>|undefined;
 try {
  admin=getSupabaseAdmin();
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  const {data,error}=token?await admin.auth.getUser(token):{data:{user:null},error:null};
  if(error||!data.user)throw Error("WAITLIST_AUTH_REQUIRED");
  enforceRateLimit(request,`appointment-waitlist:${data.user.id}`,30,60_000);
  if(new URL(request.url).searchParams.size)throw Error("WAITLIST_INVALID_INPUT");
  const identity=await admin.from("platform_identities").select("status,primary_role,email_normalized").eq("user_id",data.user.id).maybeSingle();
  if(identity.error)throw identity.error;
  if(identity.data?.status!=="Active"||identity.data.primary_role!=="customer"||identity.data.email_normalized!==data.user.email?.toLowerCase().trim())throw Error("WAITLIST_ACCESS_DENIED");
  let action="list",id:null|string=null,args:Record<string,unknown>={};
  if(request.method!=="GET") {
   const body=await request.json();
   if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(key=>!["id","action","salon_id","style_id","stylist_id","from_local","until_local","locale"].includes(key))||!WAITLIST_UUID.test(body.id||""))throw Error("WAITLIST_INVALID_INPUT");
   id=body.id; action=body.action;
   if(action==="join") {
    if(!WAITLIST_UUID.test(body.salon_id||"")||!WAITLIST_UUID.test(body.style_id||"")||(body.stylist_id!=null&&!WAITLIST_UUID.test(body.stylist_id))||!["en","fr","es","zh-CN"].includes(body.locale))throw Error("WAITLIST_INVALID_INPUT");
    const salon=await admin.from("salons").select("time_zone").eq("id",body.salon_id).maybeSingle();
    if(salon.error)throw salon.error;
    if(!salon.data)throw Error("WAITLIST_BUSINESS_UNAVAILABLE");
    let start:Date,end:Date;
    try {start=zonedLocalToUtc(body.from_local,salon.data.time_zone);end=zonedLocalToUtc(body.until_local,salon.data.time_zone);}catch{throw Error("WAITLIST_INVALID_INPUT");}
    args={salon_id:body.salon_id,style_id:body.style_id,stylist_id:body.stylist_id||null,starts_after:start.toISOString(),starts_before:end.toISOString(),locale:body.locale};
   }else if(action!=="leave")throw Error("WAITLIST_INVALID_INPUT");
  }
  const result=await admin.rpc("manage_appointment_waitlist",{p_customer:data.user.id,p_action:action,p_id:id,p_args:args});
  if(result.error)throw result.error;
  return Response.json({requests:result.data},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return waitlistFailure(request,error,admin);}
}
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/customer/waitlist","GET"),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/customer/waitlist","POST"),handle);
