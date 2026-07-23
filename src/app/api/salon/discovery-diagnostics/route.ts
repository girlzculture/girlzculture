import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { distanceMiles, validCoordinates } from "@/lib/location";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

async function GETHandler(request:Request){
  let admin;
  let salonId:string|null=null;
  try{
    const context=await requireSalonOwner(request);
    admin=context.admin;salonId=context.salon.id;
    const salon=context.salon as Record<string,unknown>;
    const [subscription,setup,activeSubscription,styles,stylists]=await Promise.all([
      admin.from("subscriptions").select("tier,status,current_period_end,stripe_subscription_id,updated_at").eq("salon_id",salonId).maybeSingle(),
      admin.rpc("salon_setup_complete",{target_salon_id:salonId}),
      admin.rpc("has_active_subscription",{target_salon_id:salonId}),
      admin.from("styles").select("id",{count:"exact",head:true}).eq("salon_id",salonId).is("archived_at",null).eq("is_draft",false),
      admin.from("stylists").select("id",{count:"exact",head:true}).eq("salon_id",salonId).is("archived_at",null).eq("is_draft",false).eq("is_active",true),
    ]);
    for(const result of [subscription,setup,activeSubscription,styles,stylists])if(result.error)throw result.error;
    const coordinates={lat:Number(salon.latitude),lng:Number(salon.longitude)};
    const search=new URL(request.url).searchParams;
    const origin={lat:Number(search.get("lat")),lng:Number(search.get("lng"))};
    const checks={
      active:String(salon.status||"").toLowerCase()==="active",
      discoverable:salon.is_discoverable===true,
      setupComplete:setup.data===true,
      subscriptionActive:activeSubscription.data===true,
      geocoded:String(salon.geocode_status||"").toLowerCase()==="success"&&validCoordinates(coordinates),
      addressApproved:salon.address_needs_review!==true,
      ownerPublished:!salon.owner_unpublished_at,
    };
    const labels:Record<keyof typeof checks,string>={active:"Salon lifecycle is not Active.",discoverable:"Marketplace discoverability is off.",setupComplete:"Required salon setup is incomplete.",subscriptionActive:"No authoritative active subscription was found.",geocoded:"The address does not have verified coordinates.",addressApproved:"The address requires review.",ownerPublished:"The owner has unpublished the salon."};
    return Response.json({
      eligible:Object.values(checks).every(Boolean),checks,
      reasons:(Object.keys(checks) as Array<keyof typeof checks>).filter((key)=>!checks[key]).map((key)=>labels[key]),
      coordinates:validCoordinates(coordinates)?coordinates:null,
      distanceMiles:validCoordinates(coordinates)&&validCoordinates(origin)?distanceMiles(origin,coordinates):null,
      catalog:{activeServices:styles.count||0,activeStylists:stylists.count||0},
      subscription:subscription.data?{tier:subscription.data.tier,status:subscription.data.status,currentPeriodEnd:subscription.data.current_period_end,updatedAt:subscription.data.updated_at}:null,
      note:"Paid placement eligibility is separate from organic local discovery.",
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return monitoredRouteFailure({request,admin,error,feature:"salon-discovery",action:"diagnostics",actorRole:"salon",salonId,safeMessage:"We couldn't verify marketplace eligibility."});
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/discovery-diagnostics", "GET"), GETHandler);
