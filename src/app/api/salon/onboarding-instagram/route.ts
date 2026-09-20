import { instagramOnboardingRequest } from "@/lib/instagramOnboardingServer";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
export const runtime = "nodejs";
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/onboarding-instagram", "GET"), instagramOnboardingRequest);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/onboarding-instagram", "POST"), instagramOnboardingRequest);
