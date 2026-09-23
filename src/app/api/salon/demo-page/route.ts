import { assistantAvatar } from "@/lib/assistantAppearance";
import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers={"Cache-Control":"private, no-store"};
async function handle(request:Request){
 let context:Awaited<ReturnType<typeof requireSalonPermission>>|undefined;
 try{
  if(new URL(request.url).search)rejectRequest("Choose the current workspace.",400);
  context=await requireSalonPermission(request,'my_page');
  const {admin,salon}=context;
  if(salon.is_demo!==true)rejectRequest("Private demo page not found.",404);
  const [services,team]=await Promise.all([
   admin.from('styles').select('id,salon_id,name,description,base_price,duration_min_hours,duration_max_hours,photos').eq('salon_id',salon.id).is('archived_at',null).eq('is_draft',false).order('sort_order').limit(100),
   admin.from('stylists').select('id,salon_id,name,bio,avatar_url,photos,specialties').eq('salon_id',salon.id).is('archived_at',null).eq('is_active',true).order('name').limit(50),
  ]);
  if(services.error||team.error)throw services.error||team.error;
  if([...services.data||[],...team.data||[]].some(row=>row.salon_id!==salon.id))throw Error('DEMO_PREVIEW_SCOPE_INVALID');
  return Response.json({sample:true,assistant:{id:salon.id,userId:context.user.id,isOwner:context.isOwner,permissions:context.isOwner?null:context.teamMember?.permissions||{},avatar:assistantAvatar(salon.gc_assistant_avatar)},business:{name:salon.name,description:salon.description,cover:salon.cover_photo_url,photos:salon.gallery_photos||[],hours:salon.hours||{},city:salon.address_city},services:services.data,team:team.data},{headers});
 }catch(error){return monitoredRouteFailure({request,admin:context?.admin,error,feature:'business-demo',action:'preview',actorId:context?.user.id,actorRole:'salon',salonId:context?.salon.id,safeMessage:'The private demo page could not load. Try again.'});}
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/demo-page','GET'),handle);
