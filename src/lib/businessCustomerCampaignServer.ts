import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/supabaseAdmin";
import { communicationUnsubscribeToken } from "@/lib/businessCommunicationServer";
import { campaignId, CampaignError, type CampaignWorkspace } from "@/lib/businessCustomerCampaigns";
import { campaignHtml } from "@/lib/businessCustomerCampaignEmail";
import { campaignCopy } from "@/i18n/business-customer-campaign-copy";
import { MARKETING_LOCALES, type MarketingLocale } from "@/lib/businessMarketing";
import { capturePlatformError } from "@/lib/platformErrors";
type Context = { admin: SupabaseClient; salonId: string; actorId: string };
async function rpc(context: Context, name: string, args: Record<string, unknown>) {
 const result = await context.admin.rpc(name, args); if (result.error) throw result.error; return result.data;
}
export async function campaignEmailAvailable(admin: SupabaseClient) {
 if (!process.env.RESEND_API_KEY) return false;
 const result = await admin.from("engine_settings").select("published_value").eq("setting_key", "notifications.channels").maybeSingle();
 if (result.error) throw result.error;
 return Array.isArray(result.data?.published_value) && result.data.published_value.includes("email");
}
export async function readCustomerCampaignWorkspace(context: Context, search = ""): Promise<CampaignWorkspace> {
 if (search.length > 100) throw new CampaignError("CAMPAIGN_INVALID");
 const data = await rpc(context, "customer_campaign_workspace", { p_salon: context.salonId, p_actor: context.actorId, p_search: search });
 if (!data || data.channel !== "email" || !Array.isArray(data.clients) || !Array.isArray(data.posts) || !Array.isArray(data.campaigns)) throw new Error("CAMPAIGN_READBACK_FAILED");
 return { ...data, clients: data.clients.slice(0, 200), email_available: await campaignEmailAvailable(context.admin), verified: true };
}
/** One permanently reserved recipient per request. A repeated request may send
 * another already-approved recipient, but can never retry an attempted one. */
export async function sendNextCustomerCampaignEmail(context: Context, id: string) {
 if (!await campaignEmailAvailable(context.admin)) throw new CampaignError("CAMPAIGN_EMAIL_UNAVAILABLE");
 // Resolve all local prerequisites before reserving any recipient.
 const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://girlzculture.com";
 const origin = new URL(configured);
 if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)) || origin.username || origin.password) throw new Error("CAMPAIGN_ORIGIN_INVALID");
 // This narrow token contains no customer data and only permits opt-out.
 communicationUnsubscribeToken(id);
 const claim = await rpc(context, "claim_customer_campaign_email", { p_salon: context.salonId, p_actor: context.actorId, p_id: id });
 if (!claim || claim.skipped === true) return;
 let status: "accepted" | "uncertain" = "uncertain";
 try {
  campaignId(claim.attempt_id); campaignId(claim.customer_id); campaignId(claim.preference_id);
  if (!MARKETING_LOCALES.includes(claim.locale) || typeof claim.destination !== "string" || /[\r\n]/.test(claim.destination) || !claim.destination.includes("@") || typeof claim.copy?.title !== "string" || typeof claim.copy?.body !== "string" || typeof claim.booking_path !== "string" || !/^\/salon\/[a-z0-9-]+\/book(?:\?|$)/.test(claim.booking_path)) throw new Error("CAMPAIGN_CLAIM_INVALID");
  const locale = claim.locale as MarketingLocale;
  const unsubscribe = new URL("/communications/unsubscribe", origin); unsubscribe.searchParams.set("token", communicationUnsubscribeToken(claim.preference_id));
  const html = campaignHtml(claim.copy, new URL(claim.booking_path, origin).href, unsubscribe.href, { book: campaignCopy(locale, "Book with this business"), unsubscribe: campaignCopy(locale, "Unsubscribe from business updates"), reason: campaignCopy(locale, "You chose to receive updates from this business.") });
  const result = await sendEmail(claim.destination, claim.copy.title, html, "account", { fromName: claim.business_name, idempotencyKey: `business-campaign:${id}:${claim.customer_id}:email`, signal: AbortSignal.timeout(12_000) });
  if (typeof result?.id === "string" && result.id.length > 0 && !result.skipped) status = "accepted";
 } catch {
  // No raw provider response, address or approved copy is added to diagnostics.
  // Abort cannot prove the provider did not accept the request.
  status = "uncertain";
 }
 const reference = status === "uncertain" ? await capturePlatformError({ admin: context.admin, actorId: context.actorId, salonId: context.salonId, actorRole: "salon", feature: "customer-campaigns", action: "email-outcome", recordType: "business_customer_campaigns", recordId: id, provider: "email", error: new Error("CAMPAIGN_OUTCOME_UNCERTAIN_NO_RETRY"), safeMessage: "An uncertain attempt needs support review and cannot be resent here. Provider acceptance does not prove delivery or reading." }) : null;
 await rpc(context, "finish_customer_campaign_email", { p_salon: context.salonId, p_id: id, p_customer: claim.customer_id, p_attempt: claim.attempt_id, p_status: status, p_reference: reference });
}
