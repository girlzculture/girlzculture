import {checkedTaskTool} from '@/lib/assistantActiveTask';
import { ASSISTANT_TOOLS, AssistantError, validateTool, type AssistantTool } from "@/lib/gcAssistantCore";
import { ASSISTANT_LANGUAGES, isAssistantLanguage, type AssistantLanguage } from "@/lib/assistantLanguage";

const destinations = ["overview", "profile", "photos", "services", "imports", "professionals", "products", "availability", "policies", "bookings", "messages", "reviews", "earnings", "promotions", "subscription", "settings", "support", "security"] as const;
const purposes: Record<AssistantTool, string> = {
  get_team_controls:"Owner-only team users/grants, professionals and payout agreements, with list totals.",
  prepare_team_controls:"Read get_team_controls. Owner review required. permissions: team-user ID; changes_json patches permission booleans and/or status Active/Inactive, preserving other grants. arrangement: professional ID; effective_from YYYY-MM-DD today/future; kind commission uses basis before_discount/after_discount + percent 0–100; booth/employee uses amount_cents integer + period week/month; none has no terms. Always include basis,percent,amount_cents,period, with unused fields null. Historical amounts unchanged. No transfers/charges/invitations.",
  get_business_controls:"Owner-only current deposits/growth/rebooking settings and own target IDs; values are saved choices, state describes plan/defaults. No contact permission or delivery is established.",
  prepare_business_controls:"Read get_business_controls first. Owner-only changes_json patch. deposits: rate,threshold_amount/rate,repeat_incident_count/rate,incident_window_days; pairs nullable, percentages 0–100, own incidents only. growth: reminder_hours (null=default), waitlist_service_ids/professional_ids (own UUID arrays). rebooking: enabled,absence_days,minimum_visits,service_ids. Preserve all unrequested fields. Review must explain future automatic contact when enabling reminders; never infer consent. Existing booking terms stay fixed; no immediate sends/provider operations.",
  get_outstanding_balances: "Read current authorized unpaid records with minimal client display names. Requires finance, bookings and client-history permissions together. Use for who owes money. Completed unpaid balances are separate from pending/future agreed amounts, never presumed overdue. Names may be absent; do not invent identity or group unrelated clients by similar names. Lists are capped but counts/totals include the authorized records. Use the returned exact Finances links; do not send reminders or collect money.",
  prepare_service_change: "Read own services first. Review changes_json with only requested name,description,master_style_id,base_price,price_display_min/max,duration_min/max_hours,buffer_minutes,is_draft,is_featured. record_id=null creates; creation requires exact platform catalog name/ID, price and both durations. Set is_draft=false only for requested publication. Preserve unrequested prices/options.",
  prepare_professional_change: "Read professionals/services first. Review changes_json: name,bio,specialties,years_experience,is_draft,assigned_service_ids. record_id=null creates. Assign only own saved service IDs; null means all, [] means none. Explicit is_draft=false publishes. No staff login/permission change; archive uses its dedicated tool.",
  prepare_product_change: "Read products first. Review changes_json: name,description,price,sale_price,sku,is_visible,in_person_only,product_status (Draft/Active/Archived),pickup_enabled,pickup_prep_minutes,shipping_enabled,shipping_price,shipping_profile,weight_ounces,max_quantity_per_order. record_id=null creates with name/price. Never infer fulfillment choices; inventory changes use stock tools. No provider operation.",
  prepare_promotion_change: "Read promotions/eligible own services/products first. Review changes_json: title,description,public_headline,promotion_type (percentage/fixed/descriptive),discount_value,discount_label,starts_at,ends_at,timezone,status (Draft/Active/Paused/Archived),target_scope (salon/services/products),target_ids. record_id=null creates. Create with title,type,value,dates,timezone. Active explicitly publishes; pause preserves history. Deposits stay protected.",
  get_business_stock: "Search own retail products and supplies with quantities and revisions; empty query lists inventory. Results cap at 30 per kind; inventory_total and matching_total are complete scoped counts. Narrow the query to resolve a missing target. Use before inventory changes.",
  prepare_stock_change: "After get_business_stock, review strict changes_json: stock_restock {kind:product|supply,quantity,cost_cents,note}; correction/consumption {kind,quantity,note}; settings {kind,track_inventory,low_stock_threshold,note}; supply_create {name,unit,quantity,low_stock_threshold,note}; supply_archive {note}. record_id=own product/supply UUID, null for creation. Never infer quantities or already-spent costs. product_fulfillment after get_products: order UUID; {fulfillment_status,carrier,tracking_number,note}. Nullable prose; carrier/tracking only for Shipped. No cancel/refund/payment/notification.",
  prepare_photo_change: "After get_business_media: photo_details changes_json={url,category,title,caption,featured,source_locale}; cover/remove={url}. category=services|before_after|space|team|client_love|other. Use an own saved URL, record_id=null. Removal unlinks, never deletes storage.",
  prepare_client_card_change: "After get_client_record: record_id=own booking UUID; operation=client_card; changes_json={locale,patch}. Patch requested preferences,notes,cautions,formula only. Formula: instructions,color,size,length,technique,duration_minutes. Never merge identities or alter permissions.",
  prepare_review_reply: "After get_reviews: record_id=own review UUID; operation=review_reply; changes_json={reply}. Owner review/confirmation precedes publication; never invent approved wording.",
  get_business_summary: "Schedule opportunities, when available, cover the current next seven days independently of the requested historical summary range. Service contribution, when available, uses the exact requested completed local-calendar period and requires fresh finance, booking and service permissions; owner-recorded costs do not establish net profit, demand or capacity. Returning-client advice uses its own current lookback window and explicit completed-visit criteria; its counts are recommendations, never contact permission. Read appointment counts, recorded no-shows, completed booking value and authorized service/professional workload for a date range. Includes comparison with the preceding equal elapsed duration; use its exact timestamps, not an assumed calendar period. A null value is unavailable, not zero. Workload and booking value are not settled revenue or forecasts.",
  get_bookings: "Read appointments and their authoritative IDs for a date range.",
  get_availability: "Read this business's current calendar. For a specific own service, requires Services plus Availability access: provide exact saved option choices; ask for required choices rather than assume. One to seven dates, conservative maximum saved duration plus selected adjustments and buffer. Count overlapping start-time alternatives, never additional appointments, demand or profit. Preserve date, time zone, total/shown/excerpt and exact calendar links. No customer eligibility or reservation is established. For a general calendar use null style_id, days=1 and selected_options=[].",
  get_business_profile: "Read current saved own-business identity, business contact details, complete address, languages spoken, hours, social links and walk-in status. Profile-public, discovery and accepting bookings are different states; null is unavailable, never false. The exact authorized business contact fields are not customer contacts or login-account credentials. Unsaved editor text and user-wide AI drafts are unavailable. Use separate permitted photo and policy tools for those records. This does not contain the service menu or prices.",
  get_business_settings: "Read current authorized business notification preferences, assistant appearance and this signed-in user's saved interface language. Requires Settings permission. Saved interface language is separate from the requested reply language. Optional null choices are unset, not disabled. Required booking alerts are configured policy, not proof of delivery. Only the current owner can change the business avatar. Returned actions navigate to existing controls; no setting, account, password or security change is performed.",
  get_business_media: "Read this business's saved gallery, cover and logo image counts and current public visibility. Use for photos, saved images and photo-count follow-ups. Counts do not establish image contents or include private customer attachments. No business ID or URL is accepted.",
  calculate_service_selection: "Calculate one currently saved own-business service selection. Requires Services and My Page permissions, plus Promotions when selecting an offer. Resolve service/option/material/offer IDs first; use only explicit choices, never invent required choices. Arguments contain no prices, subtotal, customer identity or incident history. Dollar line adjustments precede one subtotal rounding; authoritative money is in integer USD cents. This is unreserved service-only arithmetic, not a final invoice, availability or customer eligibility. Customer-dependent terms may be unavailable. Use immutable booking detail instead for an existing appointment.",
  get_booking_price_details: "Read one own-business booking's original immutable monetary terms and separately its currently verified recorded payment position. Requires current booking, client-history and finance scope, with assigned-professional restrictions. Resolve the exact booking ID first and clarify ambiguous names. Never reprice with today's catalog, deposit rule or offer. Original remaining balance is not current debt. Respect missing snapshot, test payment, future/pending and unverified payment limitations. No payment, reservation or notification is performed.",
  get_services_and_prices: "Read exact own saved service names, descriptions, catalog base/display bounds, group/category identities, required option groups, price/duration adjustments and assigned material choices. Use query='' for the menu, or the service name such as 'Silk Press' for a detail question. Always read again for a service-price follow-up. Preserve price_completeness and excerpt/unknown flags. Catalog prices/display bounds are not final subtotals, deposits, discounts or balances; required options remain unselected. No quote is calculated. Alias matches are candidates, not identical variants.",
  get_business_policies: "Read this business's published policies and its current deposit rules, including thresholds and own-business-only repeat-incident protection. Promotions preserve the pre-discount deposit; existing booking snapshots do not change.",
  search_platform_knowledge: "Search published Girlz Culture help, platform features and platform policies. Use for platform questions, not the business's own service prices.",
  get_customers: "Read customers associated with this business's appointments in a date range.",
  get_client_record: "Read this business's private client visit history from an already resolved booking ID. Backend field permissions independently govern formulas, preferences/notes, cautions, photos and spend. Staff with a linked stylist see only their assigned visits. Null fields are unavailable, not absent facts. Never infer that a client has no allergy from an inaccessible or empty caution field. Photo metadata does not establish image contents. Original formulas, quantities and cautions must retain their meaning. Updates use the client card in Bookings; never send private client notes to customer chat.",
  get_professionals: "Read team members and their authoritative IDs. Empty query lists the professionals.",
  get_products: "Read this business's catalog, fulfillment settings, private supplies and stock alerts, plus current recorded order/pickup references, dates, statuses and item snapshots without customer or financial detail. Use query='' for operational orders; a name filters the catalog only, never the separate all-time order total. Lists/items can be excerpts, not complete status counts; missing evidence is unavailable, not zero. Test-mode orders are not live activity. Untracked stock is not zero. For reviewed fulfillment use prepare_stock_change product_fulfillment; nothing performed. Use get_earnings_summary for verified product money; never infer revenue from stock, quantities or recorded payment status.",
  get_booking_messages: "Read the conversation for an already resolved booking ID.",
  get_reviews: "Read customer reviews in a date range.",
  get_promotions: "Read current own-business offers, saved conditions, date/activation state and selected targets resolved only from authorized own catalogs. Active now is not customer/checkout eligibility. Counts distinguish complete lists, excerpts and unavailable target detail. Terms may be excerpted; omitted conditions are not absent. This list does not calculate savings, deposits or balances: do not invent a quote from a percentage or base price. Exact customer/use-limit eligibility and required service options need the canonical booking workflow; existing bookings retain their original agreed terms.",
  get_plan_status: "Read the current subscription, canonical plan features/prices and limits for a scheduled downgrade. Use for entitlement and plan-comparison questions. Business usage may be unavailable; never forecast sales or change billing.",
  get_profile_completion: "Read how complete this business's profile is.",
  get_finance_records: "Own-business ledger entries in the requested period, with exact reference IDs and total counts. Resolve ambiguous records before writes. Recorded entries do not verify provider or bank settlement. No customer contacts. Requires finance-manage access.",
  prepare_finance_record: "Record money explicitly already moved; never charge, refund, transfer or notify. Require exact amount, date/time, note and confirmation. Expense: category plus operating/inventory_asset treatment; record_id/record_kind/method null. Receipt: resolved own sale/booking/order ID and actual method; category/treatment null. Refund: original own receipt ID, kind=receipt; category/treatment/method null. A request to refund is not evidence money was returned. Never infer payment or IDs.",
  get_manual_sale_options: "Read only authorized own-business service and professional IDs/names for recording a payment already received. Does not include clients, prices, other businesses or appointment availability. Read this first; ask if the service or person is ambiguous.",
  prepare_manual_service_sale: "Prepare one completed service sale and receipt in the existing Finances ledger. This records payment already received; it never charges a customer, creates an appointment or sends a receipt. Requires an explicit received amount/method/date/time/source and resolved own service/professional. Do not infer that a named person is the professional rather than the client. Anonymous clients are allowed: client_name=null. Ask whether an ambiguous walk-in means a future appointment or an already paid sale. Confirmation is mandatory.",
  get_earnings_summary: "Read current authorized business operating books, or only the actor's own stylist earnings when that is their permission. The start-inclusive/end-exclusive timestamps resolve to calendar reporting days in the business timezone. Completed sales follow completion date; receipts/refunds follow payment date. Deposits, methods and sources overlap and must never be added as separate sales. Includes recorded external sales/payments, live verified product orders, expenses and snapshotted compensation. Rankings are computed over the complete authorized period before excerpts: professionals rank by recorded commission earned plus wages due, not service turnover or payments already received; unassigned amounts are excluded explicitly. Preserve tied-leader counts and excerpt flags; own-stylist scope never establishes a business-wide winner. Expense rankings use recorded operating expenses, with inventory purchases separate. Unpaid and compensation positions are as of the end date, including earlier records. Test or unverified provider payments are not actual receipts. Service contribution is available only for the exact completed local-calendar period with finance, booking and service permissions. It uses owner-reviewed recorded costs and is not verified net profit, demand or spare capacity. Profit uses recorded costs and is qualified when costs are incomplete. Never infer zero missing costs, exact profit margins, fees, bank payouts or another business's figures. Use prepare_manual_service_sale only for explicitly received service payments; use get_finance_records and prepare_finance_record for reviewed expenses, received balances and money already returned. Other provider operations remain in the controlled Finances workflow.",
  get_upcoming_appointments: "Read upcoming appointments in a date range.",
  get_calendar_gaps: "Read calendar openings on a date, optionally for one professional.",
  prepare_manual_appointment: "Prepare a business-added appointment after resolving services, duration, professional and available time. Use service_preference=any or stylist_preference=any only when the owner explicitly says any; the server selects a safe own-business default. Owner confirmation is still required.",
  prepare_manual_reschedule: "Prepare a time change for an existing business-added appointment. Never reschedule marketplace bookings with this tool.",
  prepare_booking_reschedule_proposal: "Prepare one alternative time for a resolved marketplace booking with its current professional and unchanged payment terms. Requires a clear date, time and reason. Owner confirmation sends a proposal; only customer acceptance changes the appointment. Never infer consent or use this tool for a business-added appointment.",
  prepare_manual_cancellation: "Prepare cancellation of an existing business-added appointment, with a stated reason.",
  prepare_business_hours: "Prepare all seven days of opening hours using known values; ask about missing days.",
  prepare_service_edit: "Prepare edits to an existing draft service using its verified business service ID.",
  prepare_professional_archive: "Owner-only removal from bookable professionals. Resolve the own professional ID with get_professionals first. Prepares an archive and disables linked staff access after explicit confirmation; preserves booking and finance history. Upcoming appointments must be reassigned first. Does not delete records, cancel appointments, contact clients or issue payments.",
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

/** Share only byte-identical schema nodes after permission filtering. No tool,
 * description, constraint or context fact is removed to fit the input budget.
 * Structured Outputs supports local definitions:
 * https://developers.openai.com/api/docs/guides/structured-outputs#definitions-are-supported
 */
function withSharedDefinitions<T extends Record<string, unknown>>(schema: T): T & { $defs?: Record<string, unknown> } {
  const repeated = new Map<string, { value: Record<string, unknown>; count: number }>();
  function collect(value: unknown) {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (typeof node.type === "string" || Array.isArray(node.type) && node.type.every(type => typeof type === "string") || Array.isArray(node.anyOf)) {
      const key = JSON.stringify(node), existing = repeated.get(key);
      if (existing) existing.count++;
      else repeated.set(key, { value: node, count: 1 });
    }
    Object.values(node).forEach(collect);
  }
  collect(schema);
  const shared = new Map([...repeated].filter(([key, node]) => key.length * (node.count - 1) > 26 * node.count + 12)
    .map(([key, node], index) => [key, { ...node, name: `s${index}` }]));
  if (!shared.size) return schema;
  function rewrite(value: unknown, definitionRoot = false): unknown {
    if (Array.isArray(value)) return value.map(child => rewrite(child));
    if (!value || typeof value !== "object") return value;
    const entry = shared.get(JSON.stringify(value));
    if (entry && !definitionRoot) return { $ref: `#/$defs/${entry.name}` };
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
  }
  const $defs = Object.fromEntries([...shared.values()].map(node => [node.name, rewrite(node.value, true)]));
  const compact = { ...rewrite(schema, true) as T, $defs };
  // Factoring a parent can leave its child referenced only once. Inline those
  // children; retaining their definitions would increase the request size.
  for (;;) {
    const counts=new Map<string,number>();
    const count=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(count);return;}if(!value||typeof value!=="object")return;for(const [key,child] of Object.entries(value)){if(key==="$ref"&&typeof child==="string")counts.set(child,(counts.get(child)||0)+1);else count(child);}};
    count(compact);
    const singleton=Object.keys($defs).find(name=>(counts.get(`#/$defs/${name}`)||0)<2);
    if(!singleton)break;
    const replace=(value:unknown):unknown=>{if(Array.isArray(value))return value.map(replace);if(!value||typeof value!=="object")return value;const node=value as Record<string,unknown>;if(node.$ref===`#/$defs/${singleton}`)return $defs[singleton];return Object.fromEntries(Object.entries(node).map(([key,child])=>[key,replace(child)]));};
    for(const [key,value] of Object.entries(compact))if(key!=="$defs")(compact as Record<string,unknown>)[key]=replace(value);
    for(const name of Object.keys($defs))if(name!==singleton)$defs[name]=replace($defs[name]);
    delete $defs[singleton];
  }
  return JSON.stringify(compact).length < JSON.stringify(schema).length ? compact : schema;
}

/** A single discriminated decision prevents the provider from emitting a tool
 * and a clarification/navigation together. The answer phase has no tool shape. */
export function ownerPlannerSchema(granted: ReadonlySet<string>, answerOnly: boolean, trackTask = false) {
  if (answerOnly) return object({ reply: { type: "string", minLength: 1, maxLength: 900, description: "A complete, concise answer based only on the current authorized read. Prefer two to four short sentences; do not start a list that cannot fit." } });
  const tools = Object.entries(ASSISTANT_TOOLS).filter(([name, definition]) => granted.has(definition.permission) && (name !== "get_outstanding_balances" || granted.has("bookings") && granted.has("client_history")) && (name !== "calculate_service_selection" || granted.has("my_page")) && (name !== "get_booking_price_details" || granted.has("earnings") && granted.has("client_history"))).map(([name, definition]) => object({
    tool: { type: "string", enum: [name] }, args: definition.schema,
  }, purposes[name as AssistantTool]));
  return withSharedDefinitions(object({ ...(trackTask?{task_tool:{type:['string','null'],enum:[null,...Object.entries(ASSISTANT_TOOLS).filter(([,d])=>d.risk>=3&&granted.has(d.permission)).map(([tool])=>tool)],description:'The unfinished business action this request advances, including clarifications and reads needed before preparation. Preserve the active task while continuing it. Null for an unrelated new question or when no action is being worked on. Only explicit owner confirmation executes or completes an action.'}}:{}), language_switch: { type: ["string", "null"], enum: [null, ...ASSISTANT_LANGUAGES], description: "Only an explicit request in the current user message to change the response language sets this code. Otherwise null; preserve the existing response language." }, decision: { anyOf: [
    ...tools,
    object({ clarification: { type: "string", minLength: 1, maxLength: 240 } }, "Ask one necessary missing-detail question, or greet the owner. Never answer business-data questions here."),
    object({ navigate: { type: "string", enum: destinations } }, "Open a controlled dashboard workflow when requested, or for financial/security actions that cannot be prepared here."),
  ] } }));
}

export class AssistantPlannerError extends AssistantError {
  constructor(public reason: "JSON" | "ENVELOPE" | "DECISION" | "ANSWER" | "OUTPUT_LIMIT" | "REFUSAL") {
    super("ASSISTANT_INVALID_PLAN", 502);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
// Reject punctuation/control-only fragments, not valid non-Latin or numeric
// responses. This checks readable content, not factual or semantic correctness.
const hasProseContent = (value: string) => /[\p{L}\p{N}]/u.test(value);

export function parseOwnerPlannerResponse(text: string, granted: ReadonlySet<string>, answerOnly: boolean, trackTask = false) {
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new AssistantPlannerError("JSON"); }
  const key = answerOnly ? "reply" : "decision";
  if (!isObject(payload) || Object.keys(payload).length !== (answerOnly ? 1 : trackTask ? 3 : 2) || !Object.hasOwn(payload, key) || (!answerOnly && payload.language_switch !== null && !isAssistantLanguage(payload.language_switch))) throw new AssistantPlannerError("ENVELOPE");
  const result: { plan: { tool: string; args: Record<string, unknown> } | null; reply: string | null; clarification: string | null; navigate: string | null; task_tool?: AssistantTool|null; language_switch: AssistantLanguage | null } = { plan: null, reply: null, clarification: null, navigate: null, language_switch: answerOnly ? null : payload.language_switch as AssistantLanguage | null };
  if (answerOnly) {
    if (typeof payload.reply !== "string" || !payload.reply.trim() || payload.reply.length > 900 || !hasProseContent(payload.reply)) throw new AssistantPlannerError("ANSWER");
    result.reply = payload.reply; return result;
  }
  if(trackTask){result.task_tool=checkedTaskTool(payload.task_tool);if(result.task_tool&&!granted.has(ASSISTANT_TOOLS[result.task_tool].permission))throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);}
  const decision = payload.decision;
  if (!isObject(decision)) throw new AssistantPlannerError("DECISION");
  const keys = Object.keys(decision);
  if (keys.length === 2 && Object.hasOwn(decision, "tool") && Object.hasOwn(decision, "args")) {
    const checked = validateTool(decision.tool, decision.args);
    if(trackTask&&checked.risk>=3&&result.task_tool!==checked.tool)throw new AssistantPlannerError('DECISION');
    if (checked.tool === "get_availability" && checked.args.style_id && !granted.has("styles")) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    if (!granted.has(checked.permission)) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    if (checked.tool === "calculate_service_selection" && (!granted.has("my_page") || checked.args.promotion_id && !granted.has("promotions")) || checked.tool === "get_booking_price_details" && (!granted.has("earnings") || !granted.has("client_history"))) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    result.plan = { tool: checked.tool, args: checked.args }; return result;
  }
  if (keys.length === 1 && typeof decision.clarification === "string" && decision.clarification.trim() && decision.clarification.length <= 240 && hasProseContent(decision.clarification)) {
    result.clarification = decision.clarification; return result;
  }
  if (keys.length === 1 && typeof decision.navigate === "string" && destinations.some(value => value === decision.navigate)) {
    result.navigate = decision.navigate; return result;
  }
  throw new AssistantPlannerError("DECISION");
}
