import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError, stableJson } from "@/lib/gcAssistantCore";
import { assistantAssignedProfessional } from "@/lib/assistantProfessionalScope";
export type PriceReadContext = Awaited<ReturnType<typeof requireSalonOwner>>;
export const priceUnavailable = () => new AssistantError("ASSISTANT_PRICE_UNAVAILABLE", 503);
export const priceDenied = () => new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
export const priceObject = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export async function priceReadScope(context: PriceReadContext, permissions: string[], finance = false) {
  for (const permission of permissions) {
    const read = await context.admin.rpc("p0_actor_has_permission", { p_salon: context.salon.id, p_user: context.user.id, p_permission: permission });
    if (read.error) throw priceUnavailable();
    if (read.data !== true) throw priceDenied();
  }
  const read = await context.admin.from("salons").select("id,user_id,time_zone,subscription_tier").eq("id", context.salon.id).maybeSingle();
  const salon = priceObject(read.data);
  if (read.error || !salon || salon.id !== context.salon.id || typeof salon.user_id !== "string") throw priceUnavailable();
  if ((salon.user_id === context.user.id) !== context.isOwner) throw priceDenied();
  let assigned: string | null = null;
  if (!context.isOwner) {
    const read = await context.admin.from("salon_team_members").select("id,salon_id,user_id,status,stylist_id").eq("salon_id", context.salon.id).eq("user_id", context.user.id).eq("status", "Active").maybeSingle();
    const member = priceObject(read.data);
    if (read.error || !member || member.id !== context.teamMember?.id || member.salon_id !== context.salon.id || member.user_id !== context.user.id || member.status !== "Active") throw priceDenied();
    if (member.stylist_id != null && typeof member.stylist_id !== "string") throw priceDenied();
    assigned = member.stylist_id as string | null;
    if ((assigned ?? null) !== assistantAssignedProfessional(context)) throw priceDenied();
  }
  let kind: "business" | "own" | null = null, financeStylist: string | null = null;
  if (finance) {
    const read = await context.admin.rpc("business_finance_scope", { p_salon: context.salon.id, p_user: context.user.id });
    if (read.error || !["business", "own"].includes(read.data?.kind) || read.data.kind === "own" && typeof read.data.stylist_id !== "string") throw priceDenied();
    kind = read.data.kind; financeStylist = read.data.stylist_id ?? null;
    if (kind === "own" && assigned && assigned !== financeStylist) throw priceDenied();
  }
  return { owner: context.isOwner, assigned: assigned ?? null, kind, financeStylist, time_zone: typeof salon.time_zone === "string" ? salon.time_zone : "America/New_York", subscription_tier: salon.subscription_tier };
}
export function unchangedPriceScope(before: unknown, after: unknown) { if (stableJson(before) !== stableJson(after)) throw priceDenied(); }
