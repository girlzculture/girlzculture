export type SubscriptionPlan = "Basic" | "Growth" | "Premium";

export const SUBSCRIPTION_PLANS = {
  Basic: {
    name: "Basic" as const,
    monthlyPrice: 99.5,
    description: "Everything needed to run your salon on Girlz Culture.",
    features: ["Marketplace listing", "Salon page and team", "Unlimited bookings", "Reviews and replies", "Basic analytics"],
  },
  Growth: {
    name: "Growth" as const,
    monthlyPrice: 129.5,
    description: "More visibility and tools to grow demand.",
    features: ["Everything in Basic", "Priority search placement", "Featured rotation eligibility", "Advanced analytics", "Promotions tool"],
  },
  Premium: {
    name: "Premium" as const,
    monthlyPrice: 159.5,
    description: "Maximum marketplace visibility and support.",
    features: ["Everything in Growth", "Top search placement", "Higher featured rotation", "Premium badge", "Priority support"],
  },
} as const;

export const PLAN_ORDER: SubscriptionPlan[] = ["Basic", "Growth", "Premium"];

export function normalizePlan(value: unknown): SubscriptionPlan {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "premium" || normalized === "platinum") return "Premium";
  if (normalized === "growth" || normalized === "essentials" || normalized === "pro") return "Growth";
  return "Basic";
}

export function planRank(value: unknown) {
  return PLAN_ORDER.indexOf(normalizePlan(value)) + 1;
}

export function hasPlanFeature(plan: unknown, feature: "promotions" | "advanced_analytics" | "featured_rotation" | "premium_badge" | "priority_support") {
  const minimum = feature === "premium_badge" || feature === "priority_support" ? 3 : 2;
  return planRank(plan) >= minimum;
}

export function isSubscriptionActive(status: unknown, currentPeriodEnd?: unknown) {
  if (!["active", "trialing"].includes(String(status || "").toLowerCase())) return false;
  if (!currentPeriodEnd) return true;
  return new Date(String(currentPeriodEnd)).getTime() > Date.now();
}

export function stripePriceEnv(plan: SubscriptionPlan) {
  return ({ Basic: "STRIPE_BASIC_PRICE_ID", Growth: "STRIPE_GROWTH_PRICE_ID", Premium: "STRIPE_PREMIUM_PRICE_ID" } as const)[plan];
}
