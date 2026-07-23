import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanEmail, cleanText, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request,"newsletter",5,10*60_000);
    const body=await request.json() as Record<string,unknown>;
    rejectBot(body);
    const email=cleanEmail(body.email);
    const source=cleanText(body.source||"footer",80);
    const { error } = await getSupabaseAdmin().from("newsletter_subscribers").upsert({ email, source, status: "Active", updated_at: new Date().toISOString() }, { onConflict: "email" });
    if (error) throw error;
    console.info("Newsletter subscription saved", { source });
    return Response.json({ ok: true });
  } catch (error) {
    noteOperationalFailure("Newsletter subscription failed", error);
    return errorResponse(error,"Unable to subscribe");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/newsletter", "POST"), POSTHandler);
