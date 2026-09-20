import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { loadCalendarOpportunityEvidence } from "@/lib/bookingAvailabilityServer";
import { businessScheduleOpportunities } from "@/lib/businessScheduleOpportunities";
import { dateKeyInTimeZone, isValidTimeZone } from "@/lib/dateTime";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
async function scope(context: Context) {
  const { admin, salon, user } = context;
  const access = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: "availability" });
  if (access.error || access.data !== true) throw Error("SCHEDULE_ACCESS_DENIED");
  const business = await admin.from("salons").select("id,user_id,time_zone,hours,is_closed_override,closed_override_date").eq("id", salon.id).maybeSingle();
  if (business.error || !business.data || business.data.id !== salon.id || (business.data.user_id === user.id) !== context.isOwner || !isValidTimeZone(business.data.time_zone)) throw Error("SCHEDULE_ACCESS_DENIED");
  let assigned: string | null = null;
  if (!context.isOwner) {
    const member = await admin.from("salon_team_members").select("salon_id,user_id,status,stylist_id").eq("salon_id", salon.id).eq("user_id", user.id).eq("status", "Active").maybeSingle();
    if (member.error || !member.data || member.data.salon_id !== salon.id || member.data.user_id !== user.id || member.data.status !== "Active") throw Error("SCHEDULE_ACCESS_DENIED");
    assigned = member.data.stylist_id || null;
    if (assigned !== (context.teamMember?.stylist_id || null)) throw Error("SCHEDULE_ACCESS_DENIED");
  }
  return { business: business.data, assigned };
}
export async function readBusinessScheduleOpportunities(context: Context, now = Date.now()) {
  const before = await scope(context);
  const from = dateKeyInTimeZone(new Date(now), before.business.time_zone);
  const evidence = await loadCalendarOpportunityEvidence(context.salon.id, from);
  const after = await scope(context);
  if (JSON.stringify(before) !== JSON.stringify(after) || evidence.timeZone !== after.business.time_zone || JSON.stringify(evidence.salon.hours) !== JSON.stringify(after.business.hours) || Boolean(evidence.salon.is_closed_override) !== Boolean(after.business.is_closed_override) || (evidence.salon.closed_override_date || null) !== (after.business.closed_override_date || null)) throw Error("SCHEDULE_CHANGED");
  return businessScheduleOpportunities(context.salon.id, evidence, now, after.assigned);
}
