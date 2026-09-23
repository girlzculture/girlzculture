import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { LocationSettingsError, locationSettingsInput } from "@/lib/businessLocationSettings";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers={"Cache-Control":"private, no-store"};
async function handle(request:Request){
 let context:Awaited<ReturnType<typeof requireSalonOwner>>|undefined;
 try{
  context=await requireSalonOwner(request);
  if(context.salon.user_id!==context.user.id)rejectRequest("Owner-only access",403);
  const {admin,salon,user}=context;
  if(request.method==='POST'){
   const raw=await request.text();if(raw.length>4096)rejectRequest("Location settings are too large.",413);
   const {revision,settings}=locationSettingsInput(JSON.parse(raw));
   const saved=await admin.rpc('update_business_location_settings',{p_salon:salon.id,p_actor:user.id,p_revision:revision,p_settings:settings});
   if(saved.error){if(saved.error.message==='LOCATION_SETTINGS_STALE')return Response.json({error:'Location settings changed. Refresh before saving again.'},{status:409,headers});throw saved.error;}
   const read=await admin.rpc('business_location_settings',{p_salon:salon.id});
   if(read.error || read.data?.revision!==saved.data?.revision)throw read.error||new Error('LOCATION_READBACK_FAILED');
   return Response.json({settings:read.data,verified:true},{headers});
  }
  const read=await admin.rpc('business_location_settings',{p_salon:salon.id});if(read.error)throw read.error;
  return Response.json({settings:read.data},{headers});
 }catch(error){
  if(error instanceof LocationSettingsError || error instanceof SyntaxError)return Response.json({error:error instanceof LocationSettingsError?error.message:'Review your location settings.'},{status:400,headers});
  return monitoredRouteFailure({request,admin:context?.admin,error,feature:'business-location',action:request.method==='POST'?'save':'load',actorId:context?.user.id,actorRole:'salon',salonId:context?.salon.id,safeMessage:'Location settings could not be updated. Your edits are retained.'});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/location','GET'),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile('/api/salon/location','POST'),handle);
