import {googleBusinessCallback} from "@/lib/googleBusinessProfileServer";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
export const runtime="nodejs";
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/salon/integrations/google/callback","GET"),googleBusinessCallback);
