import { dateKeyInTimeZone } from "@/lib/dateTime";
import { errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { admin, salon, isOwner } = await requireSalonOwner(request);
    if (!isOwner) throw new Error("Only the salon owner can change the open/closed status.");
    const body = await request.json() as { closed?: boolean };
    const date = dateKeyInTimeZone(new Date(), String(salon.time_zone || "America/New_York"));
    const patch = { is_closed_override: Boolean(body.closed), closed_override_date: body.closed ? date : null, closed_override_updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("salons").update(patch).eq("id", salon.id).select("is_closed_override,closed_override_date,closed_override_updated_at").single();
    if (error) throw error;
    return Response.json({ status: body.closed ? "Closed today" : "Open according to normal hours", salon: data });
  } catch (error) { console.error("Salon open status update failed", error); return errorResponse(error, "Unable to update salon status."); }
}
