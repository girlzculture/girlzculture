import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
const unavailable = () => new AssistantError("ASSISTANT_SERVICE_UNAVAILABLE", 503);
const denied = () => new AssistantError("ASSISTANT_ACCESS_DENIED", 403);

/** These three private reads must not retain a request-time assignment after
 * the actor's current membership or ownership changes. No new grant is added. */
export async function assertCommunicationScope(context: Context, permission: "bookings" | "reviews") {
  const { admin, salon, user } = context;
  if (context.isOwner) {
    const result = await admin.from("salons").select("id,user_id").eq("id", salon.id).maybeSingle();
    if (result.error) throw unavailable();
    if (!result.data || result.data.id !== salon.id || result.data.user_id !== user.id) throw denied();
  } else {
    const result = await admin.from("salon_team_members").select("id,salon_id,user_id,status,stylist_id").eq("salon_id", salon.id).eq("user_id", user.id).eq("status", "Active").maybeSingle();
    if (result.error) throw unavailable();
    const row = result.data;
    if (!row || typeof row.id !== "string" || !row.id || row.id !== context.teamMember?.id || row.salon_id !== salon.id || row.user_id !== user.id || row.status !== "Active" ||
      (row.stylist_id ?? null) !== (context.teamMember?.stylist_id ?? null)) throw denied();
  }
  const access = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: permission });
  if (access.error) throw unavailable();
  if (access.data !== true) throw denied();
}

export function ownCommunicationRows(data: unknown, salonId: string, binding?: { field: string; value: unknown }) {
  if (!Array.isArray(data)) throw unavailable();
  const rows = data as Row[];
  if (rows.some(row => !row || typeof row !== "object" || typeof row.id !== "string" || !row.id || row.salon_id !== salonId ||
    binding && row[binding.field] !== binding.value) || new Set(rows.map(row => row.id)).size !== rows.length) throw unavailable();
  return rows;
}

/** Recheck only IDs/assignment, never retrieve additional customer facts. */
export async function assertCurrentCommunicationBookings(context: Context, ids: string[], assigned: string | null) {
  for (let offset = 0; offset < ids.length; offset += 500) {
    const page = ids.slice(offset, offset + 500);
    let query = context.admin.from("bookings").select("id,salon_id,stylist_id").eq("salon_id", context.salon.id).in("id", page);
    if (assigned) query = query.eq("stylist_id", assigned);
    const result = await query;
    if (result.error) throw unavailable();
    const rows = ownCommunicationRows(result.data, context.salon.id, assigned ? { field: "stylist_id", value: assigned } : undefined);
    if (rows.length !== page.length || rows.some(row => !page.includes(String(row.id)))) throw denied();
  }
}
