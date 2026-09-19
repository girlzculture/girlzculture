import {googleBusinessProfileRequest} from "@/lib/googleBusinessProfileServer";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
export const runtime="nodejs";
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/salon/integrations/google","GET"),googleBusinessProfileRequest);
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/salon/integrations/google","POST"),googleBusinessProfileRequest);
