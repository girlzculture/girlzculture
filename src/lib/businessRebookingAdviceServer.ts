import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { businessRebookingAdvice, type RebookingEvidence } from "@/lib/businessRebookingAdvice";
import { isValidTimeZone } from "@/lib/dateTime";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
async function scope(context: Context) {
 const { admin, salon, user } = context;
 for (const permission of ["bookings", "client_history"]) {
  const access = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: permission });
  if (access.error || access.data !== true) throw Error("REBOOKING_ACCESS_DENIED");
 }
 const business = await admin.from("salons").select("id,user_id,time_zone").eq("id", salon.id).maybeSingle();
 if (business.error || !business.data || business.data.id !== salon.id || (business.data.user_id === user.id) !== context.isOwner || !isValidTimeZone(business.data.time_zone)) throw Error("REBOOKING_ACCESS_DENIED");
 let assigned: string | null = null;
 if (!context.isOwner) {
  const member = await admin.from("salon_team_members").select("salon_id,user_id,status,stylist_id").eq("salon_id", salon.id).eq("user_id", user.id).eq("status", "Active").maybeSingle();
  if (member.error || !member.data || member.data.salon_id !== salon.id || member.data.user_id !== user.id || member.data.status !== "Active") throw Error("REBOOKING_ACCESS_DENIED");
  assigned = member.data.stylist_id || null;
  if (assigned !== (context.teamMember?.stylist_id || null)) throw Error("REBOOKING_ACCESS_DENIED");
 }
 return { business: business.data, assigned };
}
export async function readBusinessRebookingAdvice(context: Context) {
 const before = await scope(context);
 const result = await context.admin.rpc("read_business_rebooking_evidence", { p_salon: context.salon.id, p_actor: context.user.id });
 if (result.error) { if (/CLIENT_ACCESS_DENIED|REBOOKING_ACCESS_DENIED/.test(result.error.message)) throw Error("REBOOKING_ACCESS_DENIED"); throw Error("REBOOKING_UNAVAILABLE"); }
 const after = await scope(context), data = result.data as RebookingEvidence;
 if (JSON.stringify(before) !== JSON.stringify(after) || !data || data.salon_id !== context.salon.id || data.time_zone !== after.business.time_zone
  || data.scope !== (after.assigned ? "assigned_professional" : "business") || data.stylist_id !== after.assigned) throw Error("REBOOKING_ACCESS_DENIED");
 return businessRebookingAdvice(context.salon.id, data);
}
