import { requireAdmin } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { referralCampaignInput, ReferralInputError } from "@/lib/businessReferrals";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
 let context: Awaited<ReturnType<typeof requireAdmin>> | undefined;
 try {
  context = await requireAdmin(request);
  if (!context.adminUser.is_super_admin) throw new Error("REFERRAL_FORBIDDEN");
  const { admin, user } = context;
  enforceRateLimit(request, `referral-campaigns:${user.id}`, 30, 60_000);
  if (request.method === "POST") {
   // Actual campaign activation requires a separate founder-reviewed operation.
   // This release exposes configuration only; no action can issue a credit.
   const input = referralCampaignInput(await request.json());
   const result = await admin.rpc("save_business_referral_campaign", { p_actor: user.id, p_id: input.id, p_revision: input.revision, p_title: input.title, p_terms: input.terms });
   if (result.error) throw result.error;
   if (result.data?.status !== "inactive") throw new Error("REFERRAL_READBACK_FAILED");
  }
  const result = await admin.from("business_referral_campaigns").select("id,title,revision,status,terms,updated_at").order("updated_at", { ascending: false }).limit(100);
  if (result.error) throw result.error;
  return Response.json({ campaigns: result.data, issuance_enabled: false, activation_enabled: false }, { headers });
 } catch (error) {
  const message = String((error as { message?: unknown })?.message || "");
  if (/Unauthorized|Forbidden|REFERRAL_FORBIDDEN/.test(message)) return Response.json({ code: "REFERRAL_FORBIDDEN", error: "A platform owner must sign in to configure referral campaigns." }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
  if (error instanceof RateLimitError) return Response.json({ code: "REFERRAL_RATE_LIMIT", error: "Wait a moment before trying again." }, { status: 429, headers });
  if (error instanceof ReferralInputError || error instanceof SyntaxError || message === "REFERRAL_CHANGED") return Response.json({ code: message === "REFERRAL_CHANGED" ? message : "REFERRAL_INVALID", error: "Reload the saved campaign and review its terms." }, { status: message === "REFERRAL_CHANGED" ? 409 : 400, headers });
  const safeMessage = "Referral campaign configuration could not be saved or verified.";
  const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, actorRole: "admin", feature: "referral-campaigns", action: request.method.toLowerCase(), error, safeMessage });
  return safeFailure(safeMessage, reference, 500, { code: "REFERRAL_UNAVAILABLE" });
 }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/referral-campaigns", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/referral-campaigns", "POST"), handle);
