import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { referralCode, referralId, referralRecord, ReferralInputError } from "@/lib/businessReferrals";
import { refreshReferralPaymentChecks } from "@/lib/businessReferralProofServer";
import { stripeGet } from "@/lib/stripeServer";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
 let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
 try {
  context = await requireSalonOwner(request);
  if (!context.isOwner) return Response.json({ code: "REFERRAL_FORBIDDEN", error: "Only the business owner can manage referrals." }, { status: 403, headers });
  const { admin, user, salon } = context;
  let verificationPending = false;
  enforceRateLimit(request, `referrals:${user.id}`, 30, 60_000);
  if (request.method === "POST") {
   const body = await request.json();
   let result;
   if (body?.action === "code") {
    referralRecord(body, ["action", "campaign_id"]);
    result = await admin.rpc("create_business_referral_code", { p_salon: salon.id, p_actor: user.id, p_campaign: referralId(body.campaign_id) });
   } else if (body?.action === "claim") {
    referralRecord(body, ["action", "code", "confirm"]);
    if (body.confirm !== true) throw new ReferralInputError("REFERRAL_REVIEW_REQUIRED");
    result = await admin.rpc("claim_business_referral", { p_salon: salon.id, p_actor: user.id, p_code: referralCode(body.code) });
   } else if (body?.action === "refresh") {
    referralRecord(body, ["action"]);
    verificationPending = (await refreshReferralPaymentChecks(admin, salon.id, user.id, stripeGet)).pending;
    result = await admin.rpc("reconcile_business_referrals", { p_salon: salon.id, p_actor: user.id });
   } else throw new ReferralInputError();
   if (result.error) throw result.error;
  }
  const fresh = await admin.rpc("business_referral_workspace", { p_salon: salon.id, p_actor: user.id });
  if (fresh.error) throw fresh.error;
  if (!fresh.data || fresh.data.issuance_enabled !== false) throw new Error("REFERRAL_READBACK_FAILED");
  return Response.json({ ...fresh.data, verification_pending: verificationPending }, { headers });
 } catch (error) {
  const message = String((error as { message?: unknown })?.message || "");
  if (/Unauthorized|Forbidden|REFERRAL_FORBIDDEN/.test(message)) return Response.json({ code: "REFERRAL_FORBIDDEN", error: "The business owner must sign in to manage referrals." }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
  if (error instanceof RateLimitError) return Response.json({ code: "REFERRAL_RATE_LIMIT", error: "Wait a moment before trying again." }, { status: 429, headers });
  const conflict = message.match(/REFERRAL_(?:CODE_UNAVAILABLE|ALREADY_RECORDED|REVIEW_REQUIRED|CHANGED)/)?.[0];
  if (error instanceof ReferralInputError || error instanceof SyntaxError || conflict) return Response.json({ code: conflict || "REFERRAL_INVALID", error: "This referral could not be recorded. Check the code and current campaign terms." }, { status: conflict ? 409 : 400, headers });
  const safeMessage = "Referral status could not be verified. Retry to check your saved records.";
  const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, actorRole: "salon", feature: "business-referrals", action: request.method.toLowerCase(), error, safeMessage });
  return safeFailure(safeMessage, reference, 500, { code: "REFERRAL_UNAVAILABLE" });
 }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/referrals", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/referrals", "POST"), handle);
