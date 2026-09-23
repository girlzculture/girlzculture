export type PlanKey = "solo" | "solo-pro" | "starter" | "growth" | "premium";
export type SubscriptionPlan = "Solo" | "Solo Pro" | "Starter" | "Growth" | "Premium";
export type LegacySubscriptionPlan = "Basic";
export type StoredSubscriptionPlan = SubscriptionPlan | LegacySubscriptionPlan;

export type ReminderLevel = "Standard" | "Customizable" | "Advanced";
export type ReportingLevel = "Basic" | "Detailed" | "Advanced";
export type BookingSourceLevel = "Summary" | "Full" | "Full + comparisons";
export type WaitlistLevel = "Manual" | "Automated" | "Automated + targeted";
export type RebookingLevel = "Manual" | "Automatic" | "Automatic + segmented";
export type GoogleBusinessProfileHelp = "Guide" | "Assisted setup" | "Assisted setup + review";

type BoundedPlanAllowance = {
  /** `null` means unlimited, subject to the accompanying fair-use flag. */
  limit: number | null;
  fairUse: boolean;
};

export type PlanEntitlements = {
  professionalSalonProfile: true;
  unlimitedStylistProfiles: boolean;
  bookableCalendars: 1 | null;
  teamPayouts: boolean;
  gcAssistant: true;
  finances: true;
  clientCards: true;
  unlimitedAppointmentBookings: true;
  appointmentCommissionPercent: 0;
  customerDeposits: true;
  bookingSpecificCustomerChat: true;
  appointmentReminders: ReminderLevel;
  marketplaceVisibility: "Standard";
  monthlyReporting: ReportingLevel;
  bookingSourceTracking: BookingSourceLevel;
  waitlist: WaitlistLevel;
  rebookingReminders: RebookingLevel;
  customerPromotions: BoundedPlanAllowance;
  productListings: BoundedPlanAllowance;
  googleBusinessProfileHelp: GoogleBusinessProfileHelp;
  advertising: {
    discountPercent: number | null;
    credit: { amountCents: number; cadence: "quarterly" | "monthly" } | null;
    earlyAccessHours: number | null;
  };
};

export type SubscriptionPlanDefinition = {
  key: PlanKey;
  name: SubscriptionPlan;
  monthlyAmountCents: 6900 | 9900 | 14900 | 19900;
  family: "independent" | "team";
  /** New-sale catalog only. Existing agreements retain their provider price. */
  monthlyPrice: number;
  stripePriceEnv: "STRIPE_PRICE_SOLO" | "STRIPE_PRICE_SOLO_PRO" | "STRIPE_PRICE_STARTER" | "STRIPE_PRICE_GROWTH" | "STRIPE_PRICE_PREMIUM";
  /** Commercial upgrade order only. It must never influence organic discovery. */
  rank: 1 | 2 | 3 | 4 | 5;
  description: string;
  features: readonly string[];
  entitlements: PlanEntitlements;
};

export const SUBSCRIPTION_PLANS = {
  Solo: {
    key: "solo",
    name: "Solo",
    family: "independent",
    monthlyAmountCents: 6900,
    monthlyPrice: 69,
    stripePriceEnv: "STRIPE_PRICE_SOLO",
    rank: 1,
    description: "The essentials for running your business on Girlz Culture.",
    features: [
      "Professional business profile",
      "One bookable calendar",
      "Unlimited appointment bookings",
      "0% appointment commission",
      "10 product listings",
    ],
    entitlements: {
      professionalSalonProfile: true,
      unlimitedStylistProfiles: false,
      bookableCalendars: 1,
      teamPayouts: false,
      gcAssistant: true,
      finances: true,
      clientCards: true,
      unlimitedAppointmentBookings: true,
      appointmentCommissionPercent: 0,
      customerDeposits: true,
      bookingSpecificCustomerChat: true,
      appointmentReminders: "Standard",
      marketplaceVisibility: "Standard",
      monthlyReporting: "Basic",
      bookingSourceTracking: "Summary",
      waitlist: "Manual",
      rebookingReminders: "Manual",
      customerPromotions: { limit: 1, fairUse: false },
      productListings: { limit: 10, fairUse: false },
      googleBusinessProfileHelp: "Guide",
      advertising: {
        discountPercent: null,
        credit: null,
        earlyAccessHours: null,
      },
    },
  },
  "Solo Pro": {
    key: "solo-pro",
    name: "Solo Pro",
    family: "independent",
    monthlyAmountCents: 9900,
    monthlyPrice: 99,
    stripePriceEnv: "STRIPE_PRICE_SOLO_PRO",
    rank: 2,
    description: "More tools to help you understand and grow your business.",
    features: [
      "Everything in Solo",
      "Customizable appointment reminders",
      "Detailed monthly reporting",
      "Up to 3 active promotions",
      "30 product listings",
    ],
    entitlements: {
      professionalSalonProfile: true,
      unlimitedStylistProfiles: false,
      bookableCalendars: 1,
      teamPayouts: false,
      gcAssistant: true,
      finances: true,
      clientCards: true,
      unlimitedAppointmentBookings: true,
      appointmentCommissionPercent: 0,
      customerDeposits: true,
      bookingSpecificCustomerChat: true,
      appointmentReminders: "Customizable",
      marketplaceVisibility: "Standard",
      monthlyReporting: "Detailed",
      bookingSourceTracking: "Full",
      waitlist: "Automated",
      rebookingReminders: "Automatic",
      customerPromotions: { limit: 3, fairUse: false },
      productListings: { limit: 30, fairUse: false },
      googleBusinessProfileHelp: "Assisted setup",
      advertising: {
        discountPercent: 5,
        credit: { amountCents: 1000, cadence: "quarterly" },
        earlyAccessHours: null,
      },
    },
  },
  Starter: {
    key: "starter",
    name: "Starter",
    family: "team",
    monthlyAmountCents: 9900,
    monthlyPrice: 99,
    stripePriceEnv: "STRIPE_PRICE_STARTER",
    rank: 3,
    description: "The essentials for running your business on Girlz Culture.",
    features: [
      "Professional business profile",
      "Team profiles and permissions",
      "Unlimited appointment bookings",
      "0% appointment commission",
      "10 product listings",
    ],
    entitlements: {
      professionalSalonProfile: true,
      unlimitedStylistProfiles: true,
      bookableCalendars: null,
      teamPayouts: true,
      gcAssistant: true,
      finances: true,
      clientCards: true,
      unlimitedAppointmentBookings: true,
      appointmentCommissionPercent: 0,
      customerDeposits: true,
      bookingSpecificCustomerChat: true,
      appointmentReminders: "Standard",
      marketplaceVisibility: "Standard",
      monthlyReporting: "Basic",
      bookingSourceTracking: "Summary",
      waitlist: "Manual",
      rebookingReminders: "Manual",
      customerPromotions: { limit: 1, fairUse: false },
      productListings: { limit: 10, fairUse: false },
      googleBusinessProfileHelp: "Guide",
      advertising: {
        discountPercent: null,
        credit: null,
        earlyAccessHours: null,
      },
    },
  },
  Growth: {
    key: "growth",
    name: "Growth",
    family: "team",
    monthlyAmountCents: 14900,
    monthlyPrice: 149,
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
    rank: 4,
    description: "More tools to help you understand and grow your business.",
    features: [
      "Everything in Starter",
      "Customizable appointment reminders",
      "Detailed monthly reporting",
      "Up to 5 active promotions",
      "30 product listings",
    ],
    entitlements: {
      professionalSalonProfile: true,
      unlimitedStylistProfiles: true,
      bookableCalendars: null,
      teamPayouts: true,
      gcAssistant: true,
      finances: true,
      clientCards: true,
      unlimitedAppointmentBookings: true,
      appointmentCommissionPercent: 0,
      customerDeposits: true,
      bookingSpecificCustomerChat: true,
      appointmentReminders: "Customizable",
      marketplaceVisibility: "Standard",
      monthlyReporting: "Detailed",
      bookingSourceTracking: "Full",
      waitlist: "Automated",
      rebookingReminders: "Automatic",
      customerPromotions: { limit: 5, fairUse: false },
      productListings: { limit: 30, fairUse: false },
      googleBusinessProfileHelp: "Assisted setup",
      advertising: {
        discountPercent: 5,
        credit: { amountCents: 1000, cadence: "quarterly" },
        earlyAccessHours: null,
      },
    },
  },
  Premium: {
    key: "premium",
    name: "Premium",
    family: "team",
    monthlyAmountCents: 19900,
    monthlyPrice: 199,
    stripePriceEnv: "STRIPE_PRICE_PREMIUM",
    rank: 5,
    description: "Advanced operations, reporting, and advertising benefits.",
    features: [
      "Everything in Growth",
      "Advanced appointment reminders",
      "Advanced monthly reporting",
      "Unlimited promotions, fair use",
      "Unlimited product listings, fair use",
    ],
    entitlements: {
      professionalSalonProfile: true,
      unlimitedStylistProfiles: true,
      bookableCalendars: null,
      teamPayouts: true,
      gcAssistant: true,
      finances: true,
      clientCards: true,
      unlimitedAppointmentBookings: true,
      appointmentCommissionPercent: 0,
      customerDeposits: true,
      bookingSpecificCustomerChat: true,
      appointmentReminders: "Advanced",
      marketplaceVisibility: "Standard",
      monthlyReporting: "Advanced",
      bookingSourceTracking: "Full + comparisons",
      waitlist: "Automated + targeted",
      rebookingReminders: "Automatic + segmented",
      customerPromotions: { limit: null, fairUse: true },
      productListings: { limit: null, fairUse: true },
      googleBusinessProfileHelp: "Assisted setup + review",
      advertising: {
        discountPercent: 15,
        credit: { amountCents: 1000, cadence: "monthly" },
        earlyAccessHours: 48,
      },
    },
  },
} as const satisfies Record<SubscriptionPlan, SubscriptionPlanDefinition>;

export const PLAN_ORDER: SubscriptionPlan[] = ["Solo", "Solo Pro", "Starter", "Growth", "Premium"];
export const PLAN_FAMILIES = [
  { label: "For independent professionals", plans: ["Solo", "Solo Pro"] },
  { label: "For businesses with a team", plans: ["Starter", "Growth", "Premium"] },
] as const;
export function isSoloPlan(value: unknown) {
  const plan = canonicalPlanForStored(value);
  return plan === "Solo" || plan === "Solo Pro";
}

export type SalonPlanUsage = {
  productListings: number;
  activePromotions: number;
};

export type PlanDowngradeLimitConflict = {
  resource: "product listings" | "active promotions";
  count: number;
  limit: number;
  overBy: number;
};

/**
 * Compare authoritative salon usage with the canonical hard limits for a
 * requested plan. A null limit is the Premium unlimited/fair-use allowance.
 */
export function planDowngradeLimitConflicts(
  targetPlan: SubscriptionPlan,
  usage: SalonPlanUsage,
): PlanDowngradeLimitConflict[] {
  const entitlements = SUBSCRIPTION_PLANS[targetPlan].entitlements;
  const candidates = [
    {
      resource: "product listings" as const,
      count: usage.productListings,
      limit: entitlements.productListings.limit,
    },
    {
      resource: "active promotions" as const,
      count: usage.activePromotions,
      limit: entitlements.customerPromotions.limit,
    },
  ];

  return candidates.flatMap((candidate) => {
    if (candidate.limit === null || candidate.count <= candidate.limit) {
      return [];
    }
    return [{
      resource: candidate.resource,
      count: candidate.count,
      limit: candidate.limit,
      overBy: candidate.count - candidate.limit,
    }];
  });
}

/**
 * Inventory creation must honor a pending downgrade immediately. The current
 * paid plan still controls access until renewal, but it cannot be used to add
 * records that would make the already-scheduled lower plan invalid.
 */
export function restrictivePlanForLimits(
  currentPlan: unknown,
  scheduledPlan: unknown,
): SubscriptionPlan | null {
  const current = canonicalPlanForStored(currentPlan);
  if (!current) return null;
  const scheduled = canonicalPlanForStored(scheduledPlan);
  if (!scheduled) return current;
  const currentLimits = SUBSCRIPTION_PLANS[current].entitlements;
  const scheduledLimits = SUBSCRIPTION_PLANS[scheduled].entitlements;
  return ["productListings", "customerPromotions"].some(key => {
    const feature = key as "productListings" | "customerPromotions";
    return (scheduledLimits[feature].limit ?? Infinity) < (currentLimits[feature].limit ?? Infinity);
  }) ? scheduled : current;
}

export type PlanComparisonValue = true | string;
export type PlanComparisonRow = {
  key: string;
  label: string;
  values: Record<SubscriptionPlan, PlanComparisonValue>;
};

function entitlementValues(
  select: (entitlements: PlanEntitlements) => PlanComparisonValue,
): Record<SubscriptionPlan, PlanComparisonValue> {
  return Object.fromEntries(
    PLAN_ORDER.map((plan) => [plan, select(SUBSCRIPTION_PLANS[plan].entitlements)]),
  ) as Record<SubscriptionPlan, PlanComparisonValue>;
}

function allowanceLabel(allowance: BoundedPlanAllowance, boundedPrefix = "") {
  if (allowance.limit === null) return allowance.fairUse ? "Unlimited, fair use" : "Unlimited";
  return `${boundedPrefix}${allowance.limit}`;
}

function advertisingCreditLabel(credit: PlanEntitlements["advertising"]["credit"]) {
  if (!credit) return "—";
  return `$${credit.amountCents / 100} ${credit.cadence}`;
}

/** The founder-approved public comparison, in its required display order. */
export const PLAN_COMPARISON_ROWS: readonly PlanComparisonRow[] = [
  { key: "calendars", label: "Bookable calendars", values: entitlementValues(item => item.bookableCalendars === 1 ? "1" : "One per professional") },
  { key: "team-payouts", label: "Team payouts", values: entitlementValues(item => item.teamPayouts ? true : "Not included") },
  { key: "assistant", label: "Full GC Assistant", values: entitlementValues(item => item.gcAssistant) },
  { key: "finance", label: "Finances and accounting", values: entitlementValues(item => item.finances) },
  { key: "client-cards", label: "Client and formula cards", values: entitlementValues(item => item.clientCards) },
  { key: "professional-salon-profile", label: "Professional business profile", values: entitlementValues((item) => item.professionalSalonProfile) },
  { key: "unlimited-stylist-profiles", label: "Team profiles and permissions", values: entitlementValues((item) => item.unlimitedStylistProfiles ? true : "Not included") },
  { key: "unlimited-appointment-bookings", label: "Unlimited appointment bookings", values: entitlementValues((item) => item.unlimitedAppointmentBookings) },
  { key: "appointment-commission", label: "0% Girlz Culture appointment commission", values: entitlementValues((item) => item.appointmentCommissionPercent === 0 ? true : `${item.appointmentCommissionPercent}%`) },
  { key: "customer-deposits", label: "Customer deposits", values: entitlementValues((item) => item.customerDeposits) },
  { key: "booking-chat", label: "Booking-specific customer chat", values: entitlementValues((item) => item.bookingSpecificCustomerChat) },
  { key: "appointment-reminders", label: "Appointment reminders", values: entitlementValues((item) => item.appointmentReminders) },
  { key: "marketplace-visibility", label: "Marketplace visibility", values: entitlementValues((item) => item.marketplaceVisibility) },
  { key: "monthly-reporting", label: "Monthly reporting", values: entitlementValues((item) => item.monthlyReporting) },
  { key: "booking-source-tracking", label: "Booking-source tracking", values: entitlementValues((item) => item.bookingSourceTracking) },
  { key: "waitlist", label: "Waitlist", values: entitlementValues((item) => item.waitlist) },
  { key: "rebooking-reminders", label: "Rebooking reminders", values: entitlementValues((item) => item.rebookingReminders) },
  { key: "customer-promotions", label: "Customer promotions", values: entitlementValues((item) => item.customerPromotions.limit === 1 ? "1 active" : allowanceLabel(item.customerPromotions, "Up to ")) },
  { key: "product-listings", label: "Product listings", values: entitlementValues((item) => allowanceLabel(item.productListings)) },
  { key: "google-business-profile-help", label: "Google Business Profile help", values: entitlementValues((item) => item.googleBusinessProfileHelp) },
  { key: "advertising-discount", label: "Advertising discount", values: entitlementValues((item) => item.advertising.discountPercent === null ? "—" : `${item.advertising.discountPercent}%`) },
  { key: "advertising-credit", label: "Advertising credit", values: entitlementValues((item) => advertisingCreditLabel(item.advertising.credit)) },
  { key: "advertising-early-access", label: "Early access to advertising spaces", values: entitlementValues((item) => item.advertising.earlyAccessHours === null ? "—" : `${item.advertising.earlyAccessHours} hours early`) },
] as const;

/**
 * Compatibility parsing for historical database/provider labels and old
 * public plan URLs. Do not use this at a billing-mutation boundary because it
 * intentionally recognizes retired aliases.
 */
export function parsePlan(value: unknown): SubscriptionPlan | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "solo") return "Solo";
  if (["solo pro", "solo-pro"].includes(normalized)) return "Solo Pro";
  if (normalized === "starter" || normalized === "basic") return "Starter";
  if (normalized === "growth" || normalized === "essentials" || normalized === "pro") return "Growth";
  if (normalized === "premium" || normalized === "platinum") return "Premium";
  return null;
}

/** Only current plan identities are valid; provider sales require separate price verification. */
export function parseOfficialPlan(value: unknown): SubscriptionPlan | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "solo") return "Solo";
  if (["solo pro", "solo-pro"].includes(normalized)) return "Solo Pro";
  if (normalized === "starter") return "Starter";
  if (normalized === "growth") return "Growth";
  if (normalized === "premium") return "Premium";
  return null;
}

/** Submission/metadata must contain an explicit current plan, never a fallback. */
export function parseApplicationPlan(value: unknown): SubscriptionPlan | null {
  return typeof value === "string" ? parseOfficialPlan(value) : null;
}

/** Only an explicitly supplied historical URL may translate Basic to Starter. */
export function parseApplicationPlanQuery(value: unknown): SubscriptionPlan | null {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase() === "basic" ? "Starter" : parseApplicationPlan(value);
}

/** Compatibility display fallback. Never use this to infer an application choice. */
export function normalizePlan(value: unknown): SubscriptionPlan {
  return parsePlan(value) || "Starter";
}

/** Preserve an existing Basic label in billing history without offering it. */
export function parseStoredPlan(value: unknown): StoredSubscriptionPlan | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "basic") return "Basic";
  return parsePlan(value);
}

export function canonicalPlanForStored(value: unknown): SubscriptionPlan | null {
  const stored = parseStoredPlan(value);
  return stored === "Basic" ? "Starter" : stored;
}

export function displayStoredPlan(value: unknown) {
  const stored = parseStoredPlan(value);
  return stored === "Basic" ? "Basic (legacy)" : stored || "Not assigned";
}

export function planRank(value: unknown) {
  const plan = canonicalPlanForStored(value);
  return plan ? SUBSCRIPTION_PLANS[plan].rank : 0;
}

export type PlanFeature =
  | "promotions"
  | "advanced_analytics"
  | "featured_rotation"
  | "premium_badge"
  | "priority_support";

export function hasPlanFeature(plan: unknown, feature: PlanFeature) {
  const canonical = canonicalPlanForStored(plan);
  if (!canonical) return false;
  if (feature === "promotions") return true;
  if (feature === "advanced_analytics") {
    return SUBSCRIPTION_PLANS[canonical].entitlements.monthlyReporting !== "Basic";
  }
  // Organic ranking, automatic featured rotation, tier badges, and priority
  // support are not founder-approved subscription benefits.
  return false;
}

export function isSubscriptionActive(status: unknown, currentPeriodEnd?: unknown) {
  if (!["active", "trialing"].includes(String(status || "").toLowerCase())) return false;
  if (!currentPeriodEnd) return true;
  return new Date(String(currentPeriodEnd)).getTime() > Date.now();
}

export function stripePriceEnv(plan: SubscriptionPlan) {
  return SUBSCRIPTION_PLANS[plan].stripePriceEnv;
}

/**
 * Canonical variables are authoritative for new sales. Old variable names are
 * read only so existing Stripe subscriptions remain identifiable; a legacy
 * Basic price is never returned as a new Starter selection.
 */
export function planFromStripePriceId(priceId: unknown): StoredSubscriptionPlan | null {
  const value = String(priceId || "").trim();
  if (!value) return null;
  if (value === process.env.STRIPE_PRICE_STARTER) return "Starter";
  if (value === process.env.STRIPE_PRICE_GROWTH) return "Growth";
  if (value === process.env.STRIPE_PRICE_PREMIUM) return "Premium";
  if (value === process.env.STRIPE_BASIC_PRICE_ID) return "Basic";
  if (value === process.env.STRIPE_STARTER_PRICE_ID) return "Starter";
  if (value === process.env.STRIPE_GROWTH_PRICE_ID) return "Growth";
  if (value === process.env.STRIPE_PREMIUM_PRICE_ID) return "Premium";
  return null;
}
