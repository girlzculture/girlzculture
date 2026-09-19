import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";
import { assistantAssignedProfessional, assistantRequestedProfessional } from "@/lib/assistantProfessionalScope";
import { zonedLocalToUtc } from "@/lib/dateTime";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;

/** Finance entry vocabulary is separately authorized and never includes client
 * records, product prices or another business's public/private information. */
export async function readManualSaleOptions(context: Context) {
  const result = await context.admin.rpc("business_finance_entry_options", { p_salon: context.salon.id, p_user: context.user.id });
  if (result.error) {
    if (String(result.error.message).includes("ACCESS_DENIED")) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
    throw result.error;
  }
  const validOwnRow = (row: Row | null) => Boolean(row && row.salon_id === context.salon.id && typeof row.id === "string" && row.id && typeof row.name === "string" && row.name);
  if (!Array.isArray(result.data?.stylists) || !result.data.stylists.every(validOwnRow)) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  const assigned = assistantAssignedProfessional(context);
  const professionals = (Array.isArray(result.data?.stylists) ? result.data.stylists : []).filter((row: Row) => row.salon_id === context.salon.id && (!assigned || row.id === assigned)).map((row: Row) => ({ id: String(row.id), name: String(row.name) }));
  const services = await context.admin.from("styles").select("id,name,salon_id", { count: "exact" }).eq("salon_id", context.salon.id).is("archived_at", null).eq("is_draft", false).order("name").limit(300);
  if (services.error) throw services.error;
  if (!Array.isArray(services.data) || !services.data.every(validOwnRow)) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  return { services: services.data.map(row => ({ id: row.id, name: row.name })), professionals, time_zone: context.salon.time_zone || "America/New_York", capped_at: 300 };
}

export async function prepareManualSale(context: Context, args: Row) {
  assistantRequestedProfessional(context, args.stylist_id);
  const options = await readManualSaleOptions(context);
  const service = options.services.find(row => row.id === args.service_id);
  const professional = options.professionals.find((row: { id: string }) => row.id === args.stylist_id);
  if (!service || !professional) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
  const occurred = zonedLocalToUtc(`${args.date}T${args.time}`, options.time_zone);
  if (occurred.getTime() > Date.now() + 5 * 60_000) throw new AssistantError("ASSISTANT_INVALID_DATE_RANGE");
  const clientName = typeof args.client_name === "string" ? args.client_name.trim() || null : null;
  const financePayload = { occurred_at: occurred.toISOString(), source: args.source, kind: "service", name: service.name, product_id: null, stylist_id: professional.id, client_name: clientName, list_cents: args.amount_cents, discount_cents: 0, cost_cents: null, quantity: 1, method: args.method };
  return { before: {}, payload: { service_name: service.name, professional_name: professional.name, amount_cents: args.amount_cents, method: args.method, source: args.source, client_name: clientName, occurred_at: occurred.toISOString(), time_zone: options.time_zone, finance_payload: financePayload }, notices: ["MANUAL_RECEIPT_NO_PROVIDER_CHARGE"] };
}
