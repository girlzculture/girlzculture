import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { campaignAction, CampaignError } from "@/lib/businessCustomerCampaigns";
import { readCustomerCampaignWorkspace, sendNextCustomerCampaignEmail } from "@/lib/businessCustomerCampaignServer";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
 let context: Awaited<ReturnType<typeof requireSalonPermission>> | undefined;
 try {
  context = await requireSalonPermission(request, "promotions");
  if (!context.isOwner) throw new CampaignError("CAMPAIGN_FORBIDDEN");
  enforceRateLimit(request, `customer-campaigns:${context.user.id}`, 40, 60_000);
  const scope = { admin: context.admin, salonId: context.salon.id, actorId: context.user.id };
  let action: ReturnType<typeof campaignAction> | undefined;
  if (request.method === "POST") {
   action = campaignAction(await request.json());
   const common = { p_salon: scope.salonId, p_actor: scope.actorId, p_id: action.id };
   let result;
   if (action.action === "save") result = await scope.admin.rpc("save_customer_campaign", { ...common, p_post: action.post_id, p_post_revision: action.post_revision, p_customers: action.customer_ids });
   else if (action.action === "confirm") result = await scope.admin.rpc("confirm_customer_campaign", { ...common, p_revision: action.revision, p_reviewed: action.reviewed_locales });
   else if (action.action === "cancel") result = await scope.admin.rpc("cancel_customer_campaign", common);
   else await sendNextCustomerCampaignEmail(scope, action.id);
   if (result?.error) throw result.error;
  }
  const workspace = await readCustomerCampaignWorkspace(scope, new URL(request.url).searchParams.get("search") || "");
  if (action) {
   const expected = action, saved = workspace.campaigns.find(item => item.id === expected.id);
   if (!saved || expected.action === "confirm" && (saved.status !== "confirmed" || saved.revision !== expected.revision + 1)
    || expected.action === "cancel" && saved.status !== "cancelled"
    || expected.action === "save" && (saved.recipients.length !== expected.customer_ids.length || saved.recipients.some(client => !expected.customer_ids.includes(client.id)))) throw new Error("CAMPAIGN_READBACK_FAILED");
  }
  return Response.json(workspace, { headers });
 } catch (error) {
  const message = String((error as { message?: unknown })?.message || "");
  const code = error instanceof CampaignError ? error.code : message.match(/CAMPAIGN_(?:FORBIDDEN|NOT_FOUND|STALE|SOURCE_CHANGED|CONSENT_CHANGED|REQUEST_REUSED|REVIEW_REQUIRED|INVALID)/)?.[0];
  if (error instanceof RateLimitError) return Response.json({ code: "CAMPAIGN_RATE_LIMIT", error: "Wait a moment before trying again." }, { status: 429, headers });
  if (/Unauthorized|Forbidden/.test(message) || code === "CAMPAIGN_FORBIDDEN") return Response.json({ code: "CAMPAIGN_FORBIDDEN", error: "The business owner manages client updates." }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
  if (error instanceof SyntaxError || code === "CAMPAIGN_INVALID" || code === "CAMPAIGN_REVIEW_REQUIRED") return Response.json({ code: code || "CAMPAIGN_INVALID", error: "Review the selected clients and every message language before approval." }, { status: 400, headers });
  const safeMessage = "Client updates could not be verified. Refresh saved status before continuing; attempted emails are never automatically resent.";
  const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, actorRole: "salon", feature: "customer-campaigns", action: request.method.toLowerCase(), error: new Error(code || "CAMPAIGN_UNAVAILABLE"), safeMessage });
  return safeFailure(safeMessage, reference, code ? 409 : 500, { code: code || "CAMPAIGN_UNAVAILABLE" });
 }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/customer-campaigns", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/customer-campaigns", "POST"), handle);
