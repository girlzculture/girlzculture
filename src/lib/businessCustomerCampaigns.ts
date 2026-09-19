import { MARKETING_LOCALES, type MarketingCopies, type MarketingLocale } from "@/lib/businessMarketing";
export type CampaignClient = { id: string; name: string; locale: MarketingLocale; email_hint: string };
export type CustomerCampaign = { id: string; revision: number; status: "draft" | "confirmed" | "cancelled"; copies: MarketingCopies; booking_path: string; created_at: string; recipients: (CampaignClient & { status: "pending" | "processing" | "accepted" | "skipped" | "uncertain"; outcome_code: string | null; support_reference?: string | null })[] };
export type CampaignWorkspace = { clients: CampaignClient[]; clients_capped: boolean; posts: { id: string; revision: number; copies: MarketingCopies; booking_path: string }[]; campaigns: CustomerCampaign[]; channel: "email"; email_available: boolean; verified: true };
export class CampaignError extends Error { constructor(public code: string) { super(code); } }
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function campaignId(value: unknown): string { if (typeof value !== "string" || !idPattern.test(value)) throw new CampaignError("CAMPAIGN_INVALID"); return value; }
function revision(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 1) throw new CampaignError("CAMPAIGN_INVALID"); return Number(value); }
export function campaignAction(value: unknown) {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new CampaignError("CAMPAIGN_INVALID");
 const row = value as Record<string, unknown>, action = row.action;
 const allowed = action === "save" ? ["action", "id", "post_id", "post_revision", "customer_ids"] : action === "confirm" ? ["action", "id", "revision", "reviewed_locales", "confirm"] : ["action", "id", "confirm"];
 if (!["save", "confirm", "send", "cancel"].includes(String(action)) || Object.keys(row).some(key => !allowed.includes(key))) throw new CampaignError("CAMPAIGN_INVALID");
 const id = campaignId(row.id);
 if (action === "save") {
  if (!Array.isArray(row.customer_ids) || row.customer_ids.length < 1 || row.customer_ids.length > 20 || new Set(row.customer_ids).size !== row.customer_ids.length) throw new CampaignError("CAMPAIGN_INVALID");
  return { action: "save" as const, id, post_id: campaignId(row.post_id), post_revision: revision(row.post_revision), customer_ids: row.customer_ids.map(campaignId) };
 }
 if (row.confirm !== true) throw new CampaignError("CAMPAIGN_REVIEW_REQUIRED");
 if (action === "confirm") {
  if (!Array.isArray(row.reviewed_locales) || row.reviewed_locales.length < 1 || row.reviewed_locales.length > 4 || new Set(row.reviewed_locales).size !== row.reviewed_locales.length || row.reviewed_locales.some(locale => !MARKETING_LOCALES.includes(locale as MarketingLocale))) throw new CampaignError("CAMPAIGN_REVIEW_REQUIRED");
  return { action: "confirm" as const, id, revision: revision(row.revision), reviewed_locales: row.reviewed_locales as MarketingLocale[] };
 }
 return { action: action as "send" | "cancel", id };
}
