import { geocodeSalonAddress } from "@/lib/geocodingServer";
import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdminPermission(request, "salons");
    const { id } = await params;
    const [{ data: salon, error }, subscription, audit, application, future, lifecycle] = await Promise.all([
      admin.from("salons").select("*,market:location_markets(id,name,state_code,market_type)").eq("id", id).single(),
      admin.from("subscriptions").select("*").eq("salon_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("salon_status_audit").select("id,previous_status,new_status,reason,acting_admin_id,future_booking_count,created_at").eq("salon_id", id).order("created_at", { ascending: false }).limit(50),
      admin.from("salon_applications").select("id,status,submitted_at,reviewed_at").eq("salon_id", id).limit(1).maybeSingle(),
      admin.from("bookings").select("id", { count: "exact", head: true }).eq("salon_id", id).gte("appointment_datetime", new Date().toISOString()).not("status", "in", "(Cancelled,Canceled,Completed)"),
      admin.rpc("salon_publication_diagnostic", { p_salon_id: id }),
    ]);
    if (error) throw error;
    if (subscription.error) throw subscription.error;
    if (audit.error) throw audit.error;
    if (application.error) throw application.error;
    if (future.error) throw future.error;
    if (lifecycle.error) throw lifecycle.error;
    return Response.json({ salon, subscription: subscription.data, status_history: audit.data || [], application: application.data, future_booking_count: future.count || 0, lifecycle: lifecycle.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin salon detail load failed", error);
    return errorResponse(error, "Unable to load salon details.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin, user } = await requireAdminPermission(request, "salons");
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 30);
    if (action === "status") {
      const status = cleanText(body.status, 20);
      const reason = cleanText(body.reason, 1000) || null;
      const { data, error } = await admin.rpc("admin_change_salon_status", { acting_admin_id: user.id, target_salon_id: id, requested_status: status, internal_reason: reason });
      if (error) throw error;
      return Response.json({ result: data });
    }
    if (action === "geocode") {
      const result = await geocodeSalonAddress(id, { force: true });
      return Response.json({ result });
    }
    if (action === "reconcile") {
      const { data, error } = await admin.rpc("reconcile_salon_publication", { p_salon_id: id, p_actor_id: user.id, p_reason: "Admin requested lifecycle reconciliation" });
      if (error) throw error;
      return Response.json({ result: data });
    }
    throw new Error("Unknown salon action.");
  } catch (error) {
    console.error("Admin salon action failed", error);
    return errorResponse(error, "Unable to update this salon.");
  }
}
