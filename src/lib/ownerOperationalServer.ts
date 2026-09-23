import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError, type AssistantTool } from "@/lib/gcAssistantCore";
import { calendarAvailability } from "@/lib/bookingAvailabilityServer";
import { zonedLocalToUtc } from "@/lib/dateTime";
import { validateSalonRecordEntitlements } from "@/lib/salonRecordEntitlements";
import { sanitizeSalonRecord } from "@/lib/salonRecordValidation";
import { matchBusinessCatalog } from "@/lib/businessCatalogSearch";
import {selectAssistantAppointment} from "@/lib/assistantAppointmentAvailability";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
const draftTables: Partial<Record<AssistantTool, string>> = { prepare_service_edit: "styles", prepare_professional_draft: "stylists", prepare_product_draft: "salon_products", prepare_promotion_draft: "salon_promotions" };
export async function prepareOwnerOperation(context: Context, tool: AssistantTool, args: Row) {
  const { admin, salon } = context;
  let before: Row = {}; let payload: Row = {};
  const notices: string[] = [];
  if (tool === "prepare_business_hours") {
    before = { hours: salon.hours ?? null };
    payload = { hours: Object.fromEntries(Object.entries(args.hours as Row).map(([day, value]) => [day.slice(0, 3), value])) };
  }
  const table = draftTables[tool];
  if (table) {
    const id = args.id || args.style_id || null;
    if (id) {
      const existing = await admin.from(table).select("*").eq("id", id).eq("salon_id", salon.id).is("archived_at", null).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
      before = existing.data;
      const isDraft = table === "styles" || table === "stylists" ? before.is_draft === true : table === "salon_products" ? before.product_status === "Draft" : before.status === "Draft";
      if (!isDraft) throw new AssistantError("ASSISTANT_DRAFT_REQUIRED", 409);
    }
    const raw: Row = tool === "prepare_service_edit"
      ? { name: args.name, base_price: args.price, price_display_min: args.price, price_display_max: args.price, duration_min_hours: args.duration_hours, duration_max_hours: args.duration_hours, buffer_minutes: args.buffer_minutes, is_draft: true }
      : tool === "prepare_professional_draft" ? { name: args.name, bio: args.bio, specialties: args.specialties, years_experience: args.years_experience, is_draft: true, is_active: false }
      : tool === "prepare_product_draft" ? { name: args.name, description: args.description, price: args.price, product_status: "Draft", is_visible: false }
      : { title: args.title, public_headline: args.title, description: args.description, promotion_type: args.promotion_type, discount_value: args.discount_value, starts_at: args.start, ends_at: args.end, timezone: args.time_zone, target_scope: "salon", status: "Draft", is_active: false };
    // This validator is also used by the existing dashboard record-save API.
    payload = { table, record_id: id, values: sanitizeSalonRecord(table, raw, !id) };
    if (tool === "prepare_promotion_draft" && args.time_zone !== salon.time_zone) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if (table === "salon_products" || table === "salon_promotions") {
      try { await validateSalonRecordEntitlements({ admin, salonId: salon.id, table, id: id ? String(id) : null, values: payload.values as Row }); }
      catch (error) { if (error instanceof Error && /require an active salon subscription|Your .* plan allows/.test(error.message)) throw new AssistantError("ASSISTANT_PLAN_REQUIRED", 409); throw error; }
    }
    notices.push("RECORD_SAVED_AS_DRAFT");
  }
  if (["prepare_manual_reschedule", "prepare_manual_cancellation", "prepare_booking_note"].includes(tool)) {
    const booking = await admin.from("bookings").select("*").eq("id", args.booking_id).eq("salon_id", salon.id).maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
    if (tool !== "prepare_booking_note" && booking.data.booking_origin !== "business_added") throw new AssistantError("ASSISTANT_MANUAL_APPOINTMENT_REQUIRED", 409);
    if (tool !== "prepare_booking_note" && !["Confirmed", "Requested"].includes(booking.data.status)) throw new AssistantError("ASSISTANT_PREVIEW_STALE", 409);
    if (context.teamMember?.stylist_id && booking.data.stylist_id !== context.teamMember.stylist_id) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    before = booking.data;
    payload = { customer_name: before.guest_name, public_reference: before.public_reference, time_zone: salon.time_zone };
  }
  if (tool === "prepare_manual_appointment" || tool === "prepare_manual_reschedule") {
    const values = tool === "prepare_manual_reschedule" ? { ...before, ...args, style_id: before.style_id, duration_minutes: Number(before.duration_hours) * 60, service_name: before.manual_service_name } : args;
    if (!String(values.guest_name || "").trim()) throw new AssistantError("ASSISTANT_CUSTOMER_CLARIFICATION_REQUIRED", 409);
    if (values.guest_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.guest_email))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    let duration = values.duration_minutes == null ? null : Number(values.duration_minutes);
    let buffer = tool === "prepare_manual_reschedule" ? Number(before.buffer_minutes) : 0;
    let service: Row | null = null;
    let permittedServices:Row[]=[];
    if (values.style_id) {
      const result = await admin.from("styles").select("id,name,duration_min_hours,duration_max_hours,buffer_minutes,is_draft,archived_at").eq("salon_id", salon.id).eq("id", values.style_id).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data || result.data.archived_at || result.data.is_draft) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
      service = result.data;
      const min = Number(service.duration_min_hours) * 60, max = Number(service.duration_max_hours || service.duration_min_hours) * 60;
      if (!Number.isFinite(min) || min < 15 || max < min) throw new AssistantError("ASSISTANT_DURATION_CLARIFICATION_REQUIRED", 409);
      if (duration === null && min === max) duration = min;
      if (duration === null) throw new AssistantError("ASSISTANT_DURATION_CLARIFICATION_REQUIRED", 409);
      if (duration < min || duration > max) throw new AssistantError("ASSISTANT_INVALID_DURATION", 409);
      buffer = Number(service.buffer_minutes);
    } else {
      const requestedService = String(values.service_name || "").trim();
      const servicePreference = values.service_preference === "any" ? "any" : values.service_preference === "custom" ? "custom" : "named";
      if (!requestedService && servicePreference !== "any") throw new AssistantError("ASSISTANT_SERVICE_CLARIFICATION_REQUIRED", 409);
      if (servicePreference === "any") {
        const inventory = await admin.from("styles").select("id,name,duration_min_hours,duration_max_hours,buffer_minutes,is_draft,archived_at").eq("salon_id", salon.id).is("archived_at", null).eq("is_draft", false).order("name").order("id").limit(1000);
        if (inventory.error) throw inventory.error;
        const rows = Array.isArray(inventory.data) ? inventory.data as Row[] : [];
        if (!rows.length) throw new AssistantError("ASSISTANT_SERVICE_CLARIFICATION_REQUIRED", 409);
        permittedServices = rows.filter(row=>{
          const min=Number(row.duration_min_hours)*60,max=Number(row.duration_max_hours||row.duration_min_hours)*60,buffer=Number(row.buffer_minutes);
          return Number.isInteger(min)&&min>=15&&Number.isInteger(max)&&max>=min&&max<=1440&&Number.isInteger(buffer)&&buffer>=0&&buffer<=180&&(duration===null||(duration>=min&&duration<=max));
        });
        if(!permittedServices.length)throw new AssistantError("ASSISTANT_DURATION_CLARIFICATION_REQUIRED",409);
        service = permittedServices[0];
      } else if (servicePreference === "named" && requestedService) {
        const inventory = await admin.from("styles").select("id,name,duration_min_hours,duration_max_hours,buffer_minutes,is_draft,archived_at").eq("salon_id", salon.id).is("archived_at", null).eq("is_draft", false).order("name").order("id").limit(1000);
        if (inventory.error) throw inventory.error;
        const rows = Array.isArray(inventory.data) ? inventory.data as Row[] : [];
        const matches = matchBusinessCatalog(rows, requestedService);
        // Natural-language names are resolved only from this business's own
        // active catalog. A unique fuzzy candidate is safe; two candidates
        // remain an explicit clarification rather than an invented identity.
        const exact = matches.filter(match => match.exact);
        if (exact.length === 1) service = exact[0].record;
        else if (matches.length === 1) service = matches[0].record;
        else if (matches.length > 1) throw new AssistantError("ASSISTANT_SERVICE_CLARIFICATION_REQUIRED", 409);
      }
      if (service) {
        const min = Number(service.duration_min_hours) * 60, max = Number(service.duration_max_hours || service.duration_min_hours) * 60;
        if (!Number.isFinite(min) || min < 15 || max < min) throw new AssistantError("ASSISTANT_DURATION_CLARIFICATION_REQUIRED", 409);
        // An explicit "any service" request gets a deterministic safe
        // catalog default. Reserve the full saved range so a shorter-than-
        // expected selection cannot create an overlap.
        if (duration === null && servicePreference === "any" && min === max) duration = min;
        if (duration === null && servicePreference === "any" && max > min) duration = max;
        if (duration === null && min === max) duration = min;
        if (duration === null) throw new AssistantError("ASSISTANT_DURATION_CLARIFICATION_REQUIRED", 409);
        if (duration < min || duration > max) throw new AssistantError("ASSISTANT_INVALID_DURATION", 409);
        buffer = Number(service.buffer_minutes);
      } else if (duration === null) {
        throw new AssistantError("ASSISTANT_DURATION_CLARIFICATION_REQUIRED", 409);
      }
    }
    if (duration === null) throw new AssistantError("ASSISTANT_DURATION_CLARIFICATION_REQUIRED", 409);
    if (!Number.isInteger(duration) || duration < 15 || duration > 1440 || !Number.isInteger(buffer) || buffer < 0 || buffer > 180) throw new AssistantError("ASSISTANT_INVALID_DURATION");
    const roster = await admin.from("stylists").select("id,name,is_active,is_draft,archived_at,assigned_service_ids").eq("salon_id", salon.id).eq("is_active", true).is("archived_at", null).order("name").order("id");
    if (roster.error) throw roster.error;
    let professional = values.stylist_id || null;
    const stylistPreference = values.stylist_preference === "any" ? "any" : values.stylist_preference === "named" ? "named" : "unspecified";
    if (!professional && stylistPreference !== "any" && (roster.data || []).length > 1) throw new AssistantError("ASSISTANT_PROFESSIONAL_CLARIFICATION_REQUIRED", 409);
    if (!professional && roster.data?.length === 1) professional = roster.data[0].id;
    if (professional && !roster.data?.some(row => row.id === professional)) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
    if(context.teamMember?.stylist_id){
      if(professional&&professional!==context.teamMember.stylist_id)throw new AssistantError("ASSISTANT_ACCESS_DENIED",403);
      if(!roster.data?.some(row=>row.id===context.teamMember!.stylist_id))throw new AssistantError("ASSISTANT_ACCESS_DENIED",403);
      professional=context.teamMember.stylist_id;
    }
    const calendar = await calendarAvailability({ salonId: salon.id, date: String(values.date), stylistId: professional ? String(professional) : null, excludeBookingId: tool === "prepare_manual_reschedule" ? String(args.booking_id) : null });
    const start = zonedLocalToUtc(`${values.date}T${values.time}`, calendar.time_zone);
    const candidates=permittedServices.length?permittedServices.map(row=>({service:row,duration:values.duration_minutes==null?Number(row.duration_max_hours||row.duration_min_hours)*60:Number(values.duration_minutes),buffer:Number(row.buffer_minutes)})):[{service,duration,buffer}];
    const selected=selectAssistantAppointment({start:start.getTime(),candidates,roster:roster.data||[],professional:professional?String(professional):null,gaps:calendar.gaps,timeZone:calendar.time_zone,customServiceName:String(values.service_name||"")});
    professional=selected.professional;service=selected.candidate.service;duration=selected.candidate.duration;buffer=selected.candidate.buffer;
    payload = { ...payload, appointment_datetime: start.toISOString(), duration_minutes: duration, buffer_minutes: buffer, stylist_id: professional, professional_name: roster.data?.find(row => row.id === professional)?.name || null, service_name: service?.name || values.service_name, time_zone: calendar.time_zone, payment_status: "Not collected by Girlz Culture", customer_policy_acceptance: "Not accepted through Girlz Culture", service_facts: service };
    notices.push("BUSINESS_ADDED_NO_GC_PAYMENT");
  }
  return { before, payload, notices };
}
