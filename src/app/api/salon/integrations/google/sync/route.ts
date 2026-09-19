import {processGoogleBusinessProfiles} from "@/lib/googleBusinessProfileServer";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
export const runtime="nodejs";
async function handle(request:Request){
 if(!process.env.INTERNAL_API_SECRET||request.headers.get("x-internal-secret")!==process.env.INTERNAL_API_SECRET)return Response.json({error:"Unauthorized"},{status:401});
 return Response.json(await processGoogleBusinessProfiles(),{headers:{"Cache-Control":"private, no-store"}});
}
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/salon/integrations/google/sync","POST"),handle);
