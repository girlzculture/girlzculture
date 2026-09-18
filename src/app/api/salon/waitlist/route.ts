import {requireSalonPermission} from "@/lib/supabaseAdmin";
import {waitlistFailure} from "@/lib/appointmentWaitlistServer";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
async function handle(request:Request) {
 try {
  const context=await requireSalonPermission(request,"bookings");
  if(new URL(request.url).searchParams.size)throw Error("WAITLIST_INVALID_INPUT");
  const result=await context.admin.rpc("read_business_waitlist",{p_salon:context.salon.id,p_user:context.user.id});
  if(result.error)throw result.error;
  return Response.json({requests:result.data},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return waitlistFailure(request,error);}
}
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/salon/waitlist","GET"),handle);
