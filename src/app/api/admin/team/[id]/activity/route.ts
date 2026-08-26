import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Row = Record<string, unknown>;
type ActivityRow = {
  id: string;
  source: string;
  action: string;
  record_type: string;
  record_id: string;
  record_label: string;
  result: string;
  reason: string;
  created_at: string;
  before_values?: unknown;
  after_values?: unknown;
};

const text = (value: unknown) => String(value || "").trim();

function recordActivity(row: Row): ActivityRow {
  return {
    id: text(row.id),
    source: "record_management",
    action: text(row.action) || "Updated",
    record_type: text(row.record_type) || "record",
    record_id: text(row.record_id),
    record_label: text(row.record_label) || text(row.record_id),
    result: "Succeeded",
    reason: text(row.reason),
    created_at: text(row.created_at),
    before_values: row.before_values,
    after_values: row.after_values,
  };
}

async function GETHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let admin;
  let targetId = "";
  try {
    const context = await requireAdminPermission(request, "settings");
    admin = context.admin;
    targetId = (await params).id;
    const memberResult = await admin
      .from("admin_users")
      .select("id,user_id,name,email,role,status,is_super_admin")
      .eq("id", targetId)
      .maybeSingle();
    if (memberResult.error) throw memberResult.error;
    if (!memberResult.data) {
      return Response.json(
        { error: "Administrator not found." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const identityId = text(memberResult.data.user_id || memberResult.data.id);
    const [records, bookings, salonStatus, featured, security] = await Promise.all([
      admin
        .from("record_management_events")
        .select(
          "id,record_type,record_id,record_label,action,before_values,after_values,reason,created_at",
        )
        .eq("acting_user_id", identityId)
        .order("created_at", { ascending: false })
        .limit(250),
      admin
        .from("booking_audit_log")
        .select(
          "id,booking_id,action,reason,before_data,after_data,created_at",
        )
        .eq("actor_user_id", identityId)
        .order("created_at", { ascending: false })
        .limit(150),
      admin
        .from("salon_status_audit")
        .select(
          "id,salon_id,previous_status,new_status,reason,created_at",
        )
        .eq("acting_admin_id", identityId)
        .order("created_at", { ascending: false })
        .limit(150),
      admin
        .from("featured_campaign_audit")
        .select("id,campaign_id,action,reason,previous_values,new_values,created_at")
        .eq("acting_admin_id", identityId)
        .order("created_at", { ascending: false })
        .limit(150),
      admin
        .from("admin_security_events")
        .select("id,action,result,details,created_at")
        .or(`target_user_id.eq.${identityId},actor_user_id.eq.${identityId}`)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    for (const result of [records, bookings, salonStatus, featured, security]) {
      if (result.error) throw result.error;
    }
    const activity: ActivityRow[] = [
      ...(records.data || []).map((row) => recordActivity(row as Row)),
      ...(bookings.data || []).map((row) => ({
        id: `booking-${text(row.id)}`,
        source: "booking_audit",
        action: text(row.action).replaceAll("_", " ") || "Booking updated",
        record_type: "booking",
        record_id: text(row.booking_id),
        record_label: `Booking ${text(row.booking_id).slice(0, 8)}`,
        result: "Succeeded",
        reason: text(row.reason),
        created_at: text(row.created_at),
        before_values: row.before_data,
        after_values: row.after_data,
      })),
      ...(salonStatus.data || []).map((row) => ({
        id: `salon-status-${text(row.id)}`,
        source: "salon_status",
        action: "Salon status changed",
        record_type: "salon",
        record_id: text(row.salon_id),
        record_label: `Salon ${text(row.salon_id).slice(0, 8)}`,
        result: `${text(row.previous_status) || "Previous"} → ${text(row.new_status) || "Updated"}`,
        reason: text(row.reason),
        created_at: text(row.created_at),
      })),
      ...(featured.data || []).map((row) => ({
        id: `featured-${text(row.id)}`,
        source: "featured_campaign",
        action: text(row.action) || "Featured campaign updated",
        record_type: "featured_campaign",
        record_id: text(row.campaign_id),
        record_label: `Campaign ${text(row.campaign_id).slice(0, 8)}`,
        result: "Succeeded",
        reason: text(row.reason),
        created_at: text(row.created_at),
        before_values: row.previous_values,
        after_values: row.new_values,
      })),
    ]
      .filter((row) => row.created_at)
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      )
      .slice(0, 300);

    return Response.json(
      {
        member: memberResult.data,
        activity,
        security: security.data || [],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "admin-team",
      action: "load-member-activity",
      actorRole: "admin",
      recordType: "admin_user",
      recordId: targetId,
      safeMessage: "This administrator activity could not be loaded.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/team/[id]/activity", "GET"),
  GETHandler,
);
