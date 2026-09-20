import { instagramOnboardingDeletion } from "@/lib/instagramOnboardingServer";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
export const runtime = "nodejs";
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/onboarding-instagram/data-deletion", "POST"), instagramOnboardingDeletion);
