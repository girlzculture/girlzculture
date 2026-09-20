export class ReferralInputError extends Error { constructor(public code = "REFERRAL_INVALID") { super(code); } }
export const REFERRAL_RECIPIENTS = ["referrer", "referred"] as const;
export type ReferralTerms = { amount_cents: number | null; recipient: "referrer" | "referred" | null; starts_at: string | null; ends_at: string | null; minimum_payment_cents: number | null; qualifying_days: number | null; hold_days: number | null; max_rewards_per_referrer: number | null; currency: "usd" };
export type ReferralCampaign = { id: string; title: string; revision: number; status: "inactive" | "active"; terms: ReferralTerms };
export type ReferralWorkspace = { campaigns: ReferralCampaign[]; codes: { campaign_id: string; code: string }[]; claim: { id: string; status: string; campaign_title: string; created_at: string } | null; rewards: { id: string; status: string; amount_cents: number; currency: string; campaign_title: string; qualified_at: string; eligible_at: string }[]; issuance_enabled: false; verification_pending?: boolean };
export function referralRecord(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new ReferralInputError();
  return value as Record<string, unknown>;
}
export function referralId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ReferralInputError();
  return value;
}
export function referralCode(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{32}$/i.test(value.trim())) throw new ReferralInputError("REFERRAL_CODE_UNAVAILABLE");
  return value.trim().toLowerCase();
}
export function referralCampaignInput(value: unknown) {
  const row = referralRecord(value, ["action", "id", "revision", "title", "terms", "confirm"]);
  if (row.action !== "save" || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || typeof row.title !== "string" || !row.title.trim() || row.title.trim().length > 100) throw new ReferralInputError();
  const raw = referralRecord(row.terms, ["amount_cents", "recipient", "starts_at", "ends_at", "minimum_payment_cents", "qualifying_days", "hold_days", "max_rewards_per_referrer", "currency"]);
  const integer = (name: string, min: number, max: number) => {
    const number = raw[name]; if (number === null) return null;
    if (!Number.isSafeInteger(number) || Number(number) < min || Number(number) > max) throw new ReferralInputError();
    return Number(number);
  };
  const date = (name: string) => {
    const date = raw[name]; if (date === null) return null;
    if (typeof date !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date))) throw new ReferralInputError();
    return new Date(date).toISOString();
  };
  if (raw.currency !== "usd" || raw.recipient !== null && !REFERRAL_RECIPIENTS.includes(raw.recipient as "referrer")) throw new ReferralInputError();
  const terms: ReferralTerms = { currency: "usd", amount_cents: integer("amount_cents", 1, 100_000), recipient: raw.recipient as ReferralTerms["recipient"], starts_at: date("starts_at"), ends_at: date("ends_at"), minimum_payment_cents: integer("minimum_payment_cents", 1, 1_000_000), qualifying_days: integer("qualifying_days", 1, 365), hold_days: integer("hold_days", 1, 180), max_rewards_per_referrer: integer("max_rewards_per_referrer", 1, 100) };
  if (terms.starts_at && terms.ends_at && Date.parse(terms.ends_at) <= Date.parse(terms.starts_at)) throw new ReferralInputError();
  return { id: referralId(row.id), revision: Number(row.revision), title: row.title.trim(), terms };
}

/** This is the only referral projection permitted in the owner assistant. It
 * contains the owner's own reward entitlements, never the other business's
 * identity, code usage, payment, plan, customer or invoice metadata. */
export function ownReferralSummary(workspace: ReferralWorkspace) {
  return { issuance_enabled: false, rewards: workspace.rewards.map(reward => ({ status: reward.status, amount_cents: reward.amount_cents, currency: reward.currency, campaign_title: reward.campaign_title, qualified_at: reward.qualified_at, eligible_at: reward.eligible_at })) };
}
