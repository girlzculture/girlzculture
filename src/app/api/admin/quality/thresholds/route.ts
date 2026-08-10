import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";

async function PATCHHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin } = await requireAdminPermission(request, "quality");
    monitoringAdmin = admin;
    let input: Record<string, unknown>;
    try {
      input = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json(
        { error: "Enter a valid quality-threshold request." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const cancellationRate = Number(input.salon_cancellation_rate_percent);
    if (!Number.isFinite(cancellationRate) || cancellationRate < 1 || cancellationRate > 100) {
      return Response.json(
        { error: "Cancellation threshold must be between 1 and 100 percent." },
        { status: 400 },
      );
    }

    const current = await admin
      .from("admin_settings")
      .select("value")
      .eq("key", "quality_thresholds")
      .maybeSingle();
    if (current.error) throw current.error;
    const existing = current.data?.value && typeof current.data.value === "object"
      ? current.data.value as Record<string, unknown>
      : {};
    const value = {
      ...existing,
      salon_cancellation_rate_percent: cancellationRate,
    };
    const saved = await admin
      .from("admin_settings")
      .upsert({ key: "quality_thresholds", value, updated_at: new Date().toISOString() })
      .select("key,value,updated_at")
      .single();
    if (saved.error) throw saved.error;
    return Response.json({ setting: saved.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "admin-quality",
      action: "update-thresholds",
      actorRole: "admin",
      safeMessage: "We couldn't save the quality thresholds.",
    });
  }
}

export const PATCH = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/quality/thresholds", "PATCH"),
  PATCHHandler,
);
