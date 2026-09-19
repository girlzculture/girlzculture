import { ASSISTANT_TOOLS, AssistantError, validateTool, type AssistantTool } from "@/lib/gcAssistantCore";
import { ASSISTANT_LANGUAGES, isAssistantLanguage, type AssistantLanguage } from "@/lib/assistantLanguage";

const destinations = ["overview", "profile", "photos", "services", "imports", "professionals", "products", "availability", "policies", "bookings", "messages", "reviews", "earnings", "promotions", "subscription", "settings", "support", "security"] as const;
const purposes: Record<AssistantTool, string> = {
  get_outstanding_balances: "Read current authorized unpaid records with minimal client display names. Requires finance, bookings and client-history permissions together. Use for who owes money. Completed unpaid balances are separate from pending/future agreed amounts, never presumed overdue. Names may be absent; do not invent identity or group unrelated clients by similar names. Lists are capped but counts/totals include the authorized records. Use the returned exact Finances links; do not send reminders or collect money.",
  get_business_summary: "Schedule opportunities, when available, cover the current next seven days independently of the requested historical summary range. Read appointment counts, recorded no-shows, completed booking value and authorized service/professional workload for a date range. Includes comparison with the preceding equal elapsed duration; use its exact timestamps, not an assumed calendar period. A null value is unavailable, not zero. Workload and booking value are not settled revenue or forecasts.",
  get_bookings: "Read appointments and their authoritative IDs for a date range.",
  get_availability: "Read bookable times on a date. Use null IDs when no service or professional is specified.",
  get_business_profile: "Read the business name, description, address, opening hours and social links. This does not contain the service menu or prices.",
  get_business_media: "Read this business's saved gallery, cover and logo image counts and current public visibility. Use for photos, saved images and photo-count follow-ups. Counts do not establish image contents or include private customer attachments. No business ID or URL is accepted.",
  get_services_and_prices: "Read this business's actual services, prices, durations and add-ons. Use query='' for the menu, or the service name such as 'Silk Press' for a price/detail question. Always read again for a service-price follow-up, even if it is missing from earlier excerpts.",
  get_business_policies: "Read this business's published policies and its current deposit rules, including thresholds and own-business-only repeat-incident protection. Promotions preserve the pre-discount deposit; existing booking snapshots do not change.",
  search_platform_knowledge: "Search published Girlz Culture help, platform features and platform policies. Use for platform questions, not the business's own service prices.",
  get_customers: "Read customers associated with this business's appointments in a date range.",
  get_client_record: "Read this business's private client visit history from an already resolved booking ID. Backend field permissions independently govern formulas, preferences/notes, cautions, photos and spend. Staff with a linked stylist see only their assigned visits. Null fields are unavailable, not absent facts. Never infer that a client has no allergy from an inaccessible or empty caution field. Photo metadata does not establish image contents. Original formulas, quantities and cautions must retain their meaning. Updates use the client card in Bookings; never send private client notes to customer chat.",
  get_professionals: "Read team members and their authoritative IDs. Empty query lists the professionals.",
  get_products: "Read only this business's products, prices, private supplies, available stock and configured low-stock alerts. Empty query lists records; a name searches. Untracked stock is not zero. Use get_earnings_summary for actual product revenue; do not infer sales or profit from inventory.",
  get_booking_messages: "Read the conversation for an already resolved booking ID.",
  get_reviews: "Read customer reviews in a date range.",
  get_promotions: "Read this business's promotion records.",
  get_plan_status: "Read the current subscription, canonical plan features/prices and limits for a scheduled downgrade. Use for entitlement and plan-comparison questions. Business usage may be unavailable; never forecast sales or change billing.",
  get_profile_completion: "Read how complete this business's profile is.",
  get_manual_sale_options: "Read only authorized own-business service and professional IDs/names for recording a payment already received. Does not include clients, prices, other businesses or appointment availability. Read this first; ask if the service or person is ambiguous.",
  prepare_manual_service_sale: "Prepare one completed service sale and receipt in the existing Finances ledger. This records payment already received; it never charges a customer, creates an appointment or sends a receipt. Requires an explicit received amount/method/date/time/source and resolved own service/professional. Do not infer that a named person is the professional rather than the client. Anonymous clients are allowed: client_name=null. Ask whether an ambiguous walk-in means a future appointment or an already paid sale. Confirmation is mandatory.",
  get_earnings_summary: "Read current authorized business operating books, or only the actor's own stylist earnings when that is their permission. The start-inclusive/end-exclusive timestamps resolve to calendar reporting days in the business timezone. Completed sales follow completion date; receipts/refunds follow payment date. Deposits, methods and sources overlap and must never be added as separate sales. Includes recorded external sales/payments, live verified product orders, expenses and snapshotted compensation. Unpaid and compensation positions are as of the end date, including earlier records. Test or unverified provider payments are not actual receipts. Profit uses recorded costs and is qualified when costs are incomplete. Never infer zero missing costs, exact profit margins, fees, bank payouts or another business's figures. Use prepare_manual_service_sale only for explicitly received service payments; navigate to Finances for all other individual records or financial actions.",
  get_upcoming_appointments: "Read upcoming appointments in a date range.",
  get_calendar_gaps: "Read calendar openings on a date, optionally for one professional.",
  prepare_manual_appointment: "Prepare a business-added appointment after resolving services, duration, professional and available time. Owner confirmation is still required.",
  prepare_manual_reschedule: "Prepare a time change for an existing business-added appointment. Never reschedule marketplace bookings with this tool.",
  prepare_booking_reschedule_proposal: "Prepare one alternative time for a resolved marketplace booking with its current professional and unchanged payment terms. Requires a clear date, time and reason. Owner confirmation sends a proposal; only customer acceptance changes the appointment. Never infer consent or use this tool for a business-added appointment.",
  prepare_manual_cancellation: "Prepare cancellation of an existing business-added appointment, with a stated reason.",
  prepare_business_hours: "Prepare all seven days of opening hours using known values; ask about missing days.",
  prepare_service_edit: "Prepare edits to an existing draft service using its verified business service ID.",
  prepare_professional_draft: "Prepare a new or existing draft professional record.",
  prepare_product_draft: "Prepare a new or existing draft product record.",
  prepare_promotion_draft: "Prepare a promotion draft. Does not activate a paid campaign.",
  prepare_booking_note: "Prepare a private business note for a resolved booking ID. Does not send a customer message.",
  prepare_business_profile_update: "Prepare a description, opening-hours or social-link update for owner review.",
  prepare_availability_block: "Prepare a calendar block using an explicit date range and time zone.",
  prepare_service: "Prepare a new draft service using a verified platform catalog ID and stated price/duration. Deposit rates are configured separately by the owner in Finances and must not be changed through a service draft.",
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
  const tools = Object.entries(ASSISTANT_TOOLS).filter(([name, definition]) => granted.has(definition.permission) && (name !== "get_outstanding_balances" || granted.has("bookings") && granted.has("client_history"))).map(([name, definition]) => object({
    tool: { type: "string", enum: [name] }, args: definition.schema,
  }, purposes[name as AssistantTool]));
  return object({ language_switch: { type: ["string", "null"], enum: [null, ...ASSISTANT_LANGUAGES], description: "Only an explicit request in the current user message to change the response language sets this code. Otherwise null; preserve the existing response language." }, decision: { anyOf: [
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
  if (!isObject(payload) || Object.keys(payload).length !== (answerOnly ? 1 : 2) || !Object.hasOwn(payload, key) || (!answerOnly && payload.language_switch !== null && !isAssistantLanguage(payload.language_switch))) throw new AssistantPlannerError("ENVELOPE");
  const result: { plan: { tool: string; args: Record<string, unknown> } | null; reply: string | null; clarification: string | null; navigate: string | null; language_switch: AssistantLanguage | null } = { plan: null, reply: null, clarification: null, navigate: null, language_switch: answerOnly ? null : payload.language_switch as AssistantLanguage | null };
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
