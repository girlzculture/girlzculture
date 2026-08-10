import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OverviewMetricsRow = {
  total_salons?: unknown;
  active_salons?: unknown;
  pending_submissions?: unknown;
  total_customers?: unknown;
  total_bookings?: unknown;
  completed_booking_value?: unknown;
  deposits_collected?: unknown;
};

function finiteMetric(value: unknown, label: string) {
  const metric = Number(value ?? 0);
  if (!Number.isFinite(metric) || metric < 0) {
    throw new Error(`OVERVIEW_METRIC_INVALID:${label}`);
  }
  return metric;
}

async function GETHandler(request: Request) {
  const { admin } = await requireAdminPermission(request, "overview");
  const result = await admin.rpc("platform_admin_overview_metrics");
  if (result.error) throw result.error;

  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as
    | OverviewMetricsRow
    | null
    | undefined;
  if (!row) throw new Error("OVERVIEW_METRICS_EMPTY");

  return Response.json({
    metrics: {
      total_salons: finiteMetric(row.total_salons, "total_salons"),
      active_salons: finiteMetric(row.active_salons, "active_salons"),
      pending_submissions: finiteMetric(
        row.pending_submissions,
        "pending_submissions",
      ),
      total_customers: finiteMetric(row.total_customers, "total_customers"),
      total_bookings: finiteMetric(row.total_bookings, "total_bookings"),
      completed_booking_value: finiteMetric(
        row.completed_booking_value,
        "completed_booking_value",
      ),
      deposits_collected: finiteMetric(
        row.deposits_collected,
        "deposits_collected",
      ),
    },
    computed_at: new Date().toISOString(),
  });
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/overview-metrics", "GET", {
    feature: "admin-overview",
    safeMessage: "Platform overview metrics could not be loaded.",
  }),
  GETHandler,
);
