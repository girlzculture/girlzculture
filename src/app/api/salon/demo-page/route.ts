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
  const [services,team,policy]=await Promise.all([
   admin.from('styles').select('id,salon_id,name,description,base_price,duration_min_hours,duration_max_hours,photos').eq('salon_id',salon.id).is('archived_at',null).eq('is_draft',false).order('sort_order').limit(100),
   admin.from('stylists').select('id,salon_id,name,bio,avatar_url,photos,specialties').eq('salon_id',salon.id).is('archived_at',null).eq('is_active',true).order('name').limit(50),
   salon.business_policy_revision_id ? admin.from('business_policy_revisions').select('id,salon_id,policy,version,source_locale,published_at').eq('salon_id',salon.id).eq('id',salon.business_policy_revision_id).maybeSingle() : Promise.resolve({data:null,error:null}),
  ]);
  if(services.error||team.error||policy.error)throw services.error||team.error||policy.error;
  if(salon.business_policy_revision_id&&(!policy.data?.published_at||policy.data.salon_id!==salon.id))throw Error('DEMO_PREVIEW_POLICY_INVALID');
  if([...services.data||[],...team.data||[]].some(row=>row.salon_id!==salon.id))throw Error('DEMO_PREVIEW_SCOPE_INVALID');
  return Response.json({sample:true,assistant:{id:salon.id,userId:context.user.id,isOwner:context.isOwner,permissions:context.isOwner?null:context.teamMember?.permissions||{},avatar:assistantAvatar(salon.gc_assistant_avatar)},business:{name:salon.name,description:salon.description,cover:salon.cover_photo_url,photos:salon.gallery_photos||[],hours:salon.hours||{},city:salon.address_city},services:services.data,team:team.data,policy:policy.data?{id:policy.data.id,policy:policy.data.policy,version:policy.data.version,source_locale:policy.data.source_locale}:null},{headers});
 }catch(error){return monitoredRouteFailure({request,admin:context?.admin,error,feature:'business-demo',action:'preview',actorId:context?.user.id,actorRole:'salon',salonId:context?.salon.id,safeMessage:'The private demo page could not load. Try again.'});}
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/demo-page','GET'),handle);
