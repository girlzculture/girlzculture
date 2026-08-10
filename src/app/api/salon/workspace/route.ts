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
      // A subscription belongs to the salon, not to an individual login. Team
      // members need the salon's safe status/tier summary so the dashboard can
      // honor the already-active parent subscription. Billing history and
      // provider identifiers remain owner-only.
      const allowed = table === "subscriptions"
        ? true
        : context.isOwner
          ? true
          : Boolean(permission && permissions[permission]);
      if (!allowed) return [table, []] as const;
      if (table === "reviews") {
        // The owner workspace must retain the lifecycle state of reviews that
        // Platform Admin hid or resolved. Public review queries remain limited
        // to Published/non-Removed rows; this protected projection intentionally
        // returns only salon-safe moderation evidence.
        const reviewResult = await context.admin
          .from("reviews")
          .select(
            "id,booking_id,salon_id,stylist_id,rating_overall,rating_price_accuracy,rating_punctuality,rating_quality,rating_cleanliness,would_return,written_review,review_title,result_photos,salon_reply,display_name,dispute_status,dispute_reason,disputed_at,moderation_status,moderation_reason,moderated_at,created_at",
          )
          .eq("salon_id", context.salon.id)
          .order("created_at", { ascending: false });
        if (reviewResult.error) throw reviewResult.error;
        const reviewIds = (reviewResult.data || []).map((review) => review.id);
        if (!reviewIds.length) return [table, []] as const;
        const [moderationResult, disputeResult] = await Promise.all([
          context.admin
            .from("review_moderation_events")
            .select("id,review_id,action,actor_role,reason,created_at")
            .in("review_id", reviewIds)
            .order("created_at", { ascending: false }),
          context.admin
            .from("review_dispute_events")
            .select("id,review_id,action,actor_role,reason,created_at")
            .in("review_id", reviewIds)
            .order("created_at", { ascending: false }),
        ]);
        if (moderationResult.error) throw moderationResult.error;
        if (disputeResult.error) throw disputeResult.error;
        const reviews = (reviewResult.data || []).map((review) => ({
          ...review,
          moderation_events: (moderationResult.data || []).filter(
            (event) => event.review_id === review.id,
          ),
          dispute_events: (disputeResult.data || []).filter(
            (event) => event.review_id === review.id,
          ),
        }));
        return [table, reviews] as const;
      }
      let query = context.admin
        .from(table)
        .select(
          table === "subscriptions" && !context.isOwner
            ? "id,salon_id,tier,status,current_period_end"
            : "*",
        )
        .eq("salon_id", context.salon.id);
      if (ARCHIVED_RECORD_TABLES.has(table)) {
        query = query.is("archived_at", null);
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
