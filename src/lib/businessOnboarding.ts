import { parseApplicationPlan, parseApplicationPlanQuery } from "./plans";

export const BUSINESS_SETUP_OPTIONS = [
  { value: "solo_professional", label: "Solo professional — just me" },
  { value: "shared_suite_booth", label: "Shared suite / booth professional" },
  { value: "single_location_staffed", label: "Single-location business with staff" },
  { value: "multi_location", label: "Multi-location business" },
  { value: "mobile_on_location", label: "Mobile / on-location business" },
] as const;

export type BusinessSetupType = (typeof BUSINESS_SETUP_OPTIONS)[number]["value"];

export function parseBusinessSetup(value: unknown): BusinessSetupType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return BUSINESS_SETUP_OPTIONS.find(option => option.value === normalized)?.value ?? null;
}

export function businessSetupLabel(value: unknown) {
  return BUSINESS_SETUP_OPTIONS.find(option => option.value === value)?.label ?? "Not provided";
}

export function businessOnboardingHref(path: string, suppliedPlan: unknown) {
  const plan = parseApplicationPlanQuery(suppliedPlan);
  return plan ? `${path}?plan=${plan.toLowerCase()}` : path;
}

// Older signup builds wrote Starter even without a choice. Only metadata from
// the explicit-consent signup contract may restore a choice after confirmation.
export function explicitSignupPlan(metadata: Record<string, unknown> | undefined) {
  return metadata?.application_plan_explicit === true
    ? parseApplicationPlan(metadata.selected_plan)
    : null;
}
