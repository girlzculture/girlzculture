import { ASSISTANT_TOOLS, AssistantError, validateTool, type AssistantTool } from "@/lib/gcAssistantCore";

const destinations = ["profile", "services", "imports", "policies", "bookings", "subscription", "support", "security"] as const;
const purposes: Record<AssistantTool, string> = {
  get_business_summary: "Read appointment counts, completed booking value and business performance for a date range.",
  get_bookings: "Read appointments and their authoritative IDs for a date range.",
  get_availability: "Read bookable times on a date. Use null IDs when no service or professional is specified.",
  get_business_profile: "Read the business name, description, address, opening hours and social links. This does not contain the service menu or prices.",
  get_services_and_prices: "Read this business's actual services, prices, durations and add-ons. Use query='' for the menu, or the service name such as 'Silk Press' for a price/detail question. Always read again for a service-price follow-up, even if it is missing from earlier excerpts.",
  get_business_policies: "Read this business's published cancellation, rescheduling and preparation policies.",
  search_platform_knowledge: "Search published Girlz Culture help, platform features and platform policies. Use for platform questions, not the business's own service prices.",
  get_customers: "Read customers associated with this business's appointments in a date range.",
  get_professionals: "Read team members and their authoritative IDs. Empty query lists the professionals.",
  get_products: "Read this business's products and prices. Empty query lists products; a name searches products.",
  get_booking_messages: "Read the conversation for an already resolved booking ID.",
  get_reviews: "Read customer reviews in a date range.",
  get_promotions: "Read this business's promotion records.",
  get_plan_status: "Read the current subscription and plan status. Does not change billing or forecast sales.",
  get_profile_completion: "Read how complete this business's profile is.",
  get_earnings_summary: "Read completed booking value for a date range. This is not verified cash revenue or payouts.",
  get_upcoming_appointments: "Read upcoming appointments in a date range.",
  get_calendar_gaps: "Read calendar openings on a date, optionally for one professional.",
  prepare_manual_appointment: "Prepare a business-added appointment after resolving services, duration, professional and available time. Owner confirmation is still required.",
  prepare_manual_reschedule: "Prepare a time change for an existing business-added appointment. Never reschedule marketplace bookings with this tool.",
  prepare_manual_cancellation: "Prepare cancellation of an existing business-added appointment, with a stated reason.",
  prepare_business_hours: "Prepare all seven days of opening hours using known values; ask about missing days.",
  prepare_service_edit: "Prepare edits to an existing draft service using its verified business service ID.",
  prepare_professional_draft: "Prepare a new or existing draft professional record.",
  prepare_product_draft: "Prepare a new or existing draft product record.",
  prepare_promotion_draft: "Prepare a promotion draft. Does not activate a paid campaign.",
  prepare_booking_note: "Prepare a private business note for a resolved booking ID. Does not send a customer message.",
  prepare_business_profile_update: "Prepare a description, opening-hours or social-link update for owner review.",
  prepare_availability_block: "Prepare a calendar block using an explicit date range and time zone.",
  prepare_service: "Prepare a new draft service using a verified platform catalog ID and stated price/duration. Platform deposits cannot be customized.",
  prepare_customer_message: "Prepare a message for a resolved booking that has a Girlz Culture customer participant. Never send without explicit confirmation.",
  prepare_business_policy_update: "Prepare business policy changes for owner review. Platform and statutory protections remain in force.",
};

const object = (properties: Record<string, unknown>, description?: string) => ({
  type: "object", additionalProperties: false, properties, required: Object.keys(properties), ...(description ? { description } : {}),
});

/** A single discriminated decision prevents the provider from emitting a tool
 * and a clarification/navigation together. The answer phase has no tool shape. */
export function ownerPlannerSchema(granted: ReadonlySet<string>, answerOnly: boolean) {
  if (answerOnly) return object({ reply: { type: "string", minLength: 1, maxLength: 900, description: "A complete, concise answer based only on the current authorized read. Prefer two to four short sentences; do not start a list that cannot fit." } });
  const tools = Object.entries(ASSISTANT_TOOLS).filter(([, definition]) => granted.has(definition.permission)).map(([name, definition]) => object({
    tool: { type: "string", enum: [name] }, args: definition.schema,
  }, purposes[name as AssistantTool]));
  return object({ decision: { anyOf: [
    ...tools,
    object({ clarification: { type: "string", minLength: 1, maxLength: 240 } }, "Ask one necessary missing-detail question, or greet the owner. Never answer business-data questions here."),
    object({ navigate: { type: "string", enum: destinations } }, "Open a controlled dashboard workflow when requested, or for financial/security actions that cannot be prepared here."),
  ] } });
}

export class AssistantPlannerError extends AssistantError {
  constructor(public reason: "JSON" | "ENVELOPE" | "DECISION" | "ANSWER" | "OUTPUT_LIMIT" | "REFUSAL") {
    super("ASSISTANT_INVALID_PLAN", 502);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function parseOwnerPlannerResponse(text: string, granted: ReadonlySet<string>, answerOnly: boolean) {
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new AssistantPlannerError("JSON"); }
  const key = answerOnly ? "reply" : "decision";
  if (!isObject(payload) || Object.keys(payload).length !== 1 || !Object.hasOwn(payload, key)) throw new AssistantPlannerError("ENVELOPE");
  const result: { plan: { tool: string; args: Record<string, unknown> } | null; reply: string | null; clarification: string | null; navigate: string | null } = { plan: null, reply: null, clarification: null, navigate: null };
  if (answerOnly) {
    if (typeof payload.reply !== "string" || !payload.reply.trim() || payload.reply.length > 900) throw new AssistantPlannerError("ANSWER");
    result.reply = payload.reply; return result;
  }
  const decision = payload.decision;
  if (!isObject(decision)) throw new AssistantPlannerError("DECISION");
  const keys = Object.keys(decision);
  if (keys.length === 2 && Object.hasOwn(decision, "tool") && Object.hasOwn(decision, "args")) {
    const checked = validateTool(decision.tool, decision.args);
    if (!granted.has(checked.permission)) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    result.plan = { tool: checked.tool, args: checked.args }; return result;
  }
  if (keys.length === 1 && typeof decision.clarification === "string" && decision.clarification.trim() && decision.clarification.length <= 240) {
    result.clarification = decision.clarification; return result;
  }
  if (keys.length === 1 && typeof decision.navigate === "string" && destinations.some(value => value === decision.navigate)) {
    result.navigate = decision.navigate; return result;
  }
  throw new AssistantPlannerError("DECISION");
}
