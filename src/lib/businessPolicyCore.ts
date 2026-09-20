/** Structured business preferences. Mandatory platform protections are never editable. */
export const POLICY_DEFAULTS = {
  cancellation_hours: 24, rescheduling_hours: 24, grace_minutes: 15,
  no_show: "contact_business", late_arrival: "contact_business",
  deposit_treatment: "platform_rules", balance_due: "after_service",
  satisfaction: "contact_business", preparation: "", guests: "ask_first",
  children: "ask_first", walk_ins: "ask_first", notes: "",
  refund_satisfaction: "contact_business", refund_terms: "",
  business_policy_text: null,
} as const;
export type BusinessPolicy = {
  cancellation_hours: number; rescheduling_hours: number; grace_minutes: number;
  no_show: "contact_business" | "reschedule_request";
  late_arrival: "contact_business" | "reschedule_request";
  deposit_treatment: "platform_rules"; balance_due: "after_service";
  satisfaction: "contact_business"; preparation: string;
  guests: "welcome" | "ask_first" | "appointment_only";
  children: "welcome" | "ask_first" | "appointment_only";
  walk_ins: "welcome" | "ask_first" | "appointment_only"; notes: string;
  refund_satisfaction?: "contact_business" | "case_by_case" | "redo_or_refund";
  refund_terms?: string;
  business_policy_text?: string | null;
};
export class PolicyInputError extends Error {
  constructor(public code: "POLICY_INVALID" | "PLATFORM_POLICY_CONFLICT") { super(code); }
}
const options: Record<string, readonly string[]> = {
  no_show: ["contact_business", "reschedule_request"], late_arrival: ["contact_business", "reschedule_request"],
  deposit_treatment: ["platform_rules"], balance_due: ["after_service"], satisfaction: ["contact_business"],
  guests: ["welcome", "ask_first", "appointment_only"], children: ["welcome", "ask_first", "appointment_only"],
  walk_ins: ["welcome", "ask_first", "appointment_only"],
  refund_satisfaction: ["contact_business", "case_by_case", "redo_or_refund"],
};
export function validateBusinessPolicy(input: unknown): BusinessPolicy {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PolicyInputError("POLICY_INVALID");
  const row = input as Record<string, unknown>;
  const required = Object.keys(POLICY_DEFAULTS).filter(key => !["refund_satisfaction", "refund_terms", "business_policy_text"].includes(key));
  if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !Object.hasOwn(POLICY_DEFAULTS, key))) throw new PolicyInputError("POLICY_INVALID");
  if ((row.refund_satisfaction === undefined) !== (row.refund_terms === undefined)) throw new PolicyInputError("POLICY_INVALID");
  for (const [key, max] of [["cancellation_hours", 168], ["rescheduling_hours", 168], ["grace_minutes", 60]] as const) {
    if (!Number.isInteger(row[key]) || Number(row[key]) < 0 || Number(row[key]) > max) throw new PolicyInputError("POLICY_INVALID");
  }
  for (const [key, choices] of Object.entries(options)) {
    if (key === "refund_satisfaction" && row[key] === undefined) continue;
    if (!choices.includes(String(row[key]))) throw new PolicyInputError(["deposit_treatment", "balance_due", "satisfaction"].includes(key) ? "PLATFORM_POLICY_CONFLICT" : "POLICY_INVALID");
  }
  for (const key of ["preparation", "notes", "refund_terms"] as const) {
    if (key === "refund_terms" && row[key] === undefined) continue;
    if (typeof row[key] !== "string" || row[key].length > 1200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(row[key])) throw new PolicyInputError("POLICY_INVALID");
  }
  if (row.business_policy_text != null && (typeof row.business_policy_text !== "string" || row.business_policy_text.length > 12000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(row.business_policy_text))) throw new PolicyInputError("POLICY_INVALID");
  // Free-form operational notes confer no payment or legal authority. Publishing
  // requires owner review; this is an additional obvious-conflict check, not legal advice.
  if (/non[- ]?refundable|no refunds|waiv(?:e|er).{0,35}(?:rights|care)|ignore.{0,30}(?:law|stripe|platform)|aucun remboursement|sin reembolso|不退款|放弃.{0,8}权利/iu.test(`${row.preparation}\n${row.notes}`)) throw new PolicyInputError("PLATFORM_POLICY_CONFLICT");
  if (/waiv(?:e|er).{0,35}(?:rights|care)|ignore.{0,30}(?:law|stripe|platform)|放弃.{0,8}权利/iu.test(String(row.refund_terms || ""))) throw new PolicyInputError("PLATFORM_POLICY_CONFLICT");
  if (/waiv(?:e|er).{0,35}(?:rights|care)|ignore.{0,30}(?:law|stripe|platform)|放弃.{0,8}权利/iu.test(String(row.business_policy_text || ""))) throw new PolicyInputError("PLATFORM_POLICY_CONFLICT");
  return { ...row } as BusinessPolicy;
}

export const POLICY_FIELDS = [
  ["refund_satisfaction", "Refund & Service Satisfaction Policy"], ["refund_terms", "Business refund and satisfaction terms"],
  ["cancellation_hours", "Cancellation notice (hours)"], ["rescheduling_hours", "Rescheduling notice (hours)"],
  ["grace_minutes", "Late-arrival grace period (minutes)"], ["no_show", "Missed appointments"],
  ["late_arrival", "Late arrivals"], ["guests", "Guests"], ["children", "Children"], ["walk_ins", "Walk-ins"],
  ["preparation", "Before your appointment"], ["notes", "Additional business notes"],
] as const;
export const POLICY_CHOICES: Record<string, string> = {
  contact_business: "Contact the business", reschedule_request: "Request a new appointment",
  welcome: "Welcome", ask_first: "Please ask first", appointment_only: "Appointment only",
  case_by_case: "Requests reviewed individually", redo_or_refund: "Service correction or refund considered",
};
export const policyOptions = (field: string) => options[field] || [];

/** Lossless, explicit editor conversion. Published legacy revisions are never
 * rewritten. Free text remains original, and enforced numeric rules stay data. */
export function businessPolicyText(policy: BusinessPolicy, translate: (text: string) => string = value => value) {
  if (typeof policy.business_policy_text === "string") return policy.business_policy_text;
  return POLICY_FIELDS.filter(([key]) => key !== "preparation").flatMap(([key, label]) => {
    const value = policy[key];
    if (value === undefined || value === null || value === "") return [];
    const prose = key === "notes" || key === "refund_terms";
    return [`${translate(label)}: ${prose ? value : typeof value === "number" ? value : translate(POLICY_CHOICES[String(value)] || String(value))}`];
  }).join("\n\n");
}
