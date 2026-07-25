import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { isValidTimeZone } from "@/lib/dateTime";
import { errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

async function GETHandler(request: Request) {
  try {
    const { adminUser } = await requireAdminPermission(request, "settings");
    return Response.json({
      time_zone:
        String((adminUser as { time_zone?: string }).time_zone || "") ||
        "America/New_York",
    });
  } catch (error) {
    return errorResponse(error, "Unable to load your timezone preference.");
  }
}

async function PATCHHandler(request: Request) {
  try {
    const { admin, adminUser, user } = await requireAdminPermission(
      request,
      "settings",
    );
    const body = (await request.json()) as { time_zone?: unknown };
    if (!isValidTimeZone(body.time_zone)) {
      throw new Error("Choose a valid IANA timezone.");
    }
    const { data, error } = await admin
      .from("admin_users")
      .update({ time_zone: body.time_zone })
      .eq("id", (adminUser as { id: string }).id)
      .select("time_zone")
      .single();
    if (error) throw error;
    const { error: auditError } = await admin
      .from("admin_security_events")
      .insert({
        actor_user_id: user.id,
        target_user_id: user.id,
        action: "admin_timezone_updated",
        details: { time_zone: data.time_zone },
      });
    if (auditError) throw auditError;
    return Response.json({ time_zone: data.time_zone });
  } catch (error) {
    return errorResponse(error, "Unable to save your timezone preference.");
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/preferences/time-zone", "GET"),
  GETHandler,
);
export const PATCH = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/preferences/time-zone", "PATCH"),
  PATCHHandler,
);

