import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function GETHandler(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") || "";
  if (!sessionId.startsWith("cs_")) return Response.json({error:"Invalid checkout session."},{status:400});
  const admin=getSupabaseAdmin();
  const {data:intent}=await admin.from("booking_checkout_intents").select("status,booking_id").eq("stripe_checkout_session_id",sessionId).maybeSingle();
  if(!intent)return Response.json({status:"Pending"});
  const {data:booking}=intent.booking_id?await admin.from("bookings").select("id,public_reference,confirmation_code,status,appointment_datetime,business_policy_revision_id,business_policy_version,business_policy_snapshot").eq("id",intent.booking_id).single():{data:null};
  return Response.json({status:intent.status,booking});
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/booking-status", "GET"), GETHandler);
