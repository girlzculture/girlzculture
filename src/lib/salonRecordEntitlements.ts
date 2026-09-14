import {
  canonicalPlanForStored,
  isSubscriptionActive,
  restrictivePlanForLimits,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from "@/lib/plans";
import type { requireSalonPermission } from "@/lib/supabaseAdmin";

function planLimit(plan: SubscriptionPlan, table: string) {
  if (table === "salon_products") {
    return SUBSCRIPTION_PLANS[plan].entitlements.productListings.limit;
  }
  return SUBSCRIPTION_PLANS[plan].entitlements.customerPromotions.limit;
}

async function enforcePlanAllowance(input: {
  admin: Awaited<ReturnType<typeof requireSalonPermission>>["admin"];
  salonId: string;
  storedPlan: unknown;
  table: "salon_products" | "salon_promotions";
  id: string | null;
  values: Record<string, unknown>;
}) {
  const plan = canonicalPlanForStored(input.storedPlan) || "Starter";
  const limit = planLimit(plan, input.table);
  if (limit === null) return;

  const isNewProduct = input.table === "salon_products" && !input.id
    && input.values.archived_at == null
    && input.values.product_status !== "Archived";
  const activatesPromotion = input.table === "salon_promotions"
    && input.values.archived_at == null
    && input.values.status === "Active"
    && input.values.is_active === true;
  if (!isNewProduct && !activatesPromotion) return;

  let countQuery = input.admin
    .from(input.table)
    .select("id", { count: "exact", head: true })
    .eq("salon_id", input.salonId)
    .is("archived_at", null);
  if (input.table === "salon_products") {
    countQuery = countQuery.neq("product_status", "Archived");
  } else {
    countQuery = countQuery.eq("status", "Active").eq("is_active", true);
  }
  if (input.id) countQuery = countQuery.neq("id", input.id);
  const counted = await countQuery;
  if (counted.error) throw counted.error;
  if ((counted.count || 0) >= limit) {
    const item = input.table === "salon_products" ? "product listings" : "active promotions";
    throw new Error(`Your ${plan} plan allows ${limit} ${item}. Archive one or choose another plan before adding more.`);
  }
}

export async function validateSalonRecordEntitlements(input: Omit<Parameters<typeof enforcePlanAllowance>[0], "storedPlan">) {
  const subscription = await input.admin.from("subscriptions").select("tier,status,current_period_end,scheduled_tier").eq("salon_id", input.salonId).maybeSingle();
  if (subscription.error) throw subscription.error;
  if (!subscription.data || !isSubscriptionActive(subscription.data.status, subscription.data.current_period_end)) throw new Error(`${input.table === "salon_products" ? "Products" : "Promotions"} require an active salon subscription.`);
  await enforcePlanAllowance({ ...input, storedPlan: restrictivePlanForLimits(subscription.data.tier, subscription.data.scheduled_tier) });
}
