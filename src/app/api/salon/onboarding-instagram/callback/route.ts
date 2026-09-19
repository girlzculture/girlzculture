import { instagramOnboardingCallback } from "@/lib/instagramOnboardingServer";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
export const runtime = "nodejs";
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/onboarding-instagram/callback", "GET"), instagramOnboardingCallback);
