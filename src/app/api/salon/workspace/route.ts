import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

type WorkspaceKey = "bookings" | "reviews" | "styles" | "stylists" | "salon_products" | "salon_promotions" | "subscriptions" | "billing_events" | "notifications" | "salon_blockouts";

const TABLE_ACCESS: Record<WorkspaceKey, string | null> = {
  bookings: "bookings",
  reviews: "reviews",
  styles: "styles",
  stylists: "stylists",
  salon_products: "products",
  salon_promotions: "promotions",
  subscriptions: null,
  billing_events: null,
  notifications: "bookings",
  salon_blockouts: "availability",
};

const ARCHIVED_RECORD_TABLES = new Set<WorkspaceKey>([
  "styles",
  "stylists",
  "salon_products",
  "salon_promotions",
]);

async function GETHandler(request: Request) {
  let admin;
  try {
    const context = await requireSalonOwner(request);
    admin = context.admin;
    const permissions = (context.teamMember?.permissions || {}) as Record<string, boolean>;
    const entries = await Promise.all((Object.keys(TABLE_ACCESS) as WorkspaceKey[]).map(async (table) => {
      const permission = TABLE_ACCESS[table];
      const allowed = context.isOwner ? true : Boolean(permission && permissions[permission]);
      if (!allowed) return [table, []] as const;
      let query = context.admin
        .from(table)
        .select("*")
        .eq("salon_id", context.salon.id);
      if (ARCHIVED_RECORD_TABLES.has(table)) {
        query = query.is("archived_at", null);
      }
      if (table === "reviews") {
        query = query
          .eq("moderation_status", "Published")
          .or("dispute_status.is.null,dispute_status.neq.Removed");
      }
      const result = await query.order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return [table, result.data || []] as const;
    }));
    return Response.json({
      salon: context.salon,
      records: Object.fromEntries(entries),
      permissions: context.isOwner ? null : permissions,
      isTeamMember: !context.isOwner,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "salon-dashboard", action: "load-workspace", actorRole: "salon", safeMessage: "We couldn't load the salon workspace." });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/workspace", "GET"), GETHandler);
