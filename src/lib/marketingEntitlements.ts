import type { SupabaseClient } from "@supabase/supabase-js";
import { rejectRequest } from "@/lib/platformErrors";
import { stripeGet } from "@/lib/stripeServer";

type Placement = "Featured Salon" | "Trending Video";
type StripeEvidence = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount_received?: number;
  amount_paid?: number;
  currency?: string;
  metadata?: Record<string, string>;
};

export async function verifyMarketingEntitlement(args: {
  admin: SupabaseClient;
  source: string | null;
  reference: string | null;
  salonId: string;
  placement: Placement;
  startsAt: string;
  endsAt: string;
}) {
  const { admin, source, reference, salonId, placement, startsAt, endsAt } = args;
  if (!source || !reference) return null;

  if (source === "platform_credit") {
    const result = await admin.from("marketing_entitlements").select("amount_minor,currency,status,valid_from,valid_until").eq("source", source).eq("external_reference", reference).eq("salon_id", salonId).eq("placement_type", placement).maybeSingle();
    if (result.error) throw result.error;
    const credit = result.data;
    if (!credit || credit.status !== "Credited" || new Date(credit.valid_from) > new Date(startsAt) || (credit.valid_until && new Date(credit.valid_until) < new Date(endsAt))) rejectRequest("Choose a verified platform credit that covers the full campaign period.");
    return { amountMinor: Number(credit.amount_minor || 0), currency: String(credit.currency || "usd") };
  }

  const expectedKind = placement === "Featured Salon" ? "featured_salon" : "trending_video";
  let evidence: StripeEvidence;
  if (source === "stripe_payment") {
    if (!/^pi_[A-Za-z0-9]+$/.test(reference)) rejectRequest("Enter a Stripe PaymentIntent reference beginning with pi_.");
    evidence = await stripeGet<StripeEvidence>(`/payment_intents/${encodeURIComponent(reference)}`);
    if (evidence.status !== "succeeded") rejectRequest("Stripe has not confirmed this marketing payment as succeeded.");
  } else if (source === "verified_invoice") {
    if (!/^in_[A-Za-z0-9]+$/.test(reference)) rejectRequest("Enter a Stripe invoice reference beginning with in_.");
    evidence = await stripeGet<StripeEvidence>(`/invoices/${encodeURIComponent(reference)}`);
    if (evidence.status !== "paid" && evidence.paid !== true) rejectRequest("Stripe has not confirmed this marketing invoice as paid.");
  } else {
    rejectRequest("Choose a supported verified entitlement source.");
  }

  if (evidence.metadata?.salon_id !== salonId || evidence.metadata?.placement_type !== expectedKind) rejectRequest("This Stripe payment is not assigned to this salon and placement type.");
  if (evidence.metadata?.campaign_valid_from && new Date(evidence.metadata.campaign_valid_from) > new Date(startsAt)) rejectRequest("The Stripe evidence starts after this campaign begins.");
  if (evidence.metadata?.campaign_valid_until && new Date(evidence.metadata.campaign_valid_until) < new Date(endsAt)) rejectRequest("The Stripe evidence does not cover the full campaign period.");
  return { amountMinor: Number(evidence.amount_received || evidence.amount_paid || 0), currency: String(evidence.currency || "usd") };
}
