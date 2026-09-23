import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers={"Cache-Control":"private, no-store"};
async function handle(request:Request,route:{params:Promise<{id:string}>}) {
 let context:Awaited<ReturnType<typeof requireAdminPermission>>|undefined;
 try{
  context=await requireAdminPermission(request,"submissions");
  enforceRateLimit(request,"business-location-visit",30,60000);
  const {id}=await route.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))rejectRequest("Invalid application.",400);
  const application=await context.admin.from("salon_applications").select("salon_id,application_details").eq("id",id).single();
  if(application.error)throw application.error;
  if(request.method==="POST"){
   const body=await request.json();
   if(body.attest_visited!==true)rejectRequest("Confirm that the in-person visit actually took place.",400);
   if(!['verified','rejected'].includes(body.status)||typeof body.evidence!=="string"||body.evidence.trim().length<10||body.evidence.length>2000||typeof body.visited_at!=="string"||!Number.isFinite(Date.parse(body.visited_at)))rejectRequest("Enter the visit date, outcome and evidence.",400);
   const saved=await context.admin.rpc("record_business_location_visit",{p_salon:application.data.salon_id,p_actor:context.user.id,p_status:body.status,p_visited_at:body.visited_at,p_evidence:body.evidence});
   if(saved.error)throw saved.error;
  }
  const read=await context.admin.from("business_verification_locations").select("address_street,address_line2,address_city,address_state,address_zip,host_business_name,visit_status,visited_at,verified_by,visit_evidence,geocode_status").eq("salon_id",application.data.salon_id).maybeSingle();
  if(read.error)throw read.error;
  return Response.json({location:read.data,details:application.data.application_details,verified:request.method==='POST'},{headers});
 }catch(error){return monitoredRouteFailure({request,admin:context?.admin,error,feature:"business-verification",action:request.method,actorId:context?.user.id,actorRole:"admin",safeMessage:"The location review could not be completed. Your evidence remains on this page."});}
}
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/admin/submissions/[id]/location-visit","GET"),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/admin/submissions/[id]/location-visit","POST"),handle);
