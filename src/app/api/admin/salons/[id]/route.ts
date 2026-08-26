import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { geocodeSalonAddress } from "@/lib/geocodingServer";
import {
  cleanText,
  errorResponse,
} from "@/lib/requestSecurity";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

type Row = Record<string, unknown>;

function mergeById(...collections: Array<Row[] | null | undefined>) {
  const rows = new Map<string, Row>();
  for (const collection of collections) {
    for (const row of collection || []) {
      const id = String(row.id || crypto.randomUUID());
      if (!rows.has(id)) rows.set(id, row);
    }
  }
  return [...rows.values()].sort(
    (left, right) =>
      new Date(String(right.created_at || 0)).getTime() -
      new Date(String(left.created_at || 0)).getTime(),
  );
}

async function GETHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let admin;
  let salonId: string | null = null;
  try {
    const context = await requireAdminPermission(request, "salons");
    admin = context.admin;
    const { id } = await params;
    salonId = id;

    const [
      salonResult,
      subscription,
      audit,
      application,
      future,
      lifecycle,
      vanityRequest,
      vanityAudit,
      team,
      services,
      stylists,
      products,
      recentBookings,
      recentReviews,
      supportTickets,
      directManagementEvents,
      dependentManagementEvents,
    ] = await Promise.all([
      admin
        .from("salons")
        .select("*,market:location_markets(id,name,state_code,market_type)")
        .eq("id", id)
        .single(),
      admin
        .from("subscriptions")
        .select("*")
        .eq("salon_id", id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("salon_status_audit")
        .select(
          "id,previous_status,new_status,reason,acting_admin_id,future_booking_count,created_at",
        )
        .eq("salon_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("salon_applications")
        .select("*")
        .eq("salon_id", id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("salon_id", id)
        .gte("appointment_datetime", new Date().toISOString())
        .not("status", "in", "(Cancelled,Canceled,Completed)"),
      admin.rpc("salon_publication_diagnostic", { p_salon_id: id }),
      admin
        .from("salon_vanity_requests")
        .select("*")
        .eq("salon_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("salon_vanity_audit")
        .select(
          "id,action,previous_slug,resulting_slug,details,created_at",
        )
        .eq("salon_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("salon_team_members")
        .select("*")
        .eq("salon_id", id)
        .order("name")
        .limit(500),
      admin
        .from("styles")
        .select("*")
        .eq("salon_id", id)
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("stylists")
        .select("*")
        .eq("salon_id", id)
        .order("name")
        .limit(500),
      admin
        .from("salon_products")
        .select("*")
        .eq("salon_id", id)
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("bookings")
        .select("*")
        .eq("salon_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("reviews")
        .select("*")
        .eq("salon_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("support_tickets")
        .select("*")
        .eq("salon_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("record_management_events")
        .select("*")
        .eq("record_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("record_management_events")
        .select("*")
        .contains("dependency_summary", { salon_id: id })
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    for (const result of [
      salonResult,
      subscription,
      audit,
      application,
      future,
      lifecycle,
      vanityRequest,
      vanityAudit,
      team,
      services,
      stylists,
      products,
      recentBookings,
      recentReviews,
      supportTickets,
      directManagementEvents,
      dependentManagementEvents,
    ]) {
      if (result.error) throw result.error;
    }
    const salon = salonResult.data;
    if (!salon) throw new Error("Salon not found.");

    const applicationId = application.data?.id
      ? String(application.data.id)
      : "";
    const ownerUserId = salon.user_id ? String(salon.user_id) : "";
    const [documents, registrationIdentity] = await Promise.all([
      applicationId
        ? admin
            .from("application_document_uploads")
            .select("*")
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      ownerUserId
        ? admin
            .from("platform_identities")
            .select("*")
            .eq("user_id", ownerUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (documents.error) throw documents.error;
    if (registrationIdentity.error) throw registrationIdentity.error;

    return Response.json(
      {
        salon,
        subscription: subscription.data,
        status_history: audit.data || [],
        application: application.data,
        future_booking_count: future.count || 0,
        lifecycle: lifecycle.data,
        vanity_request: vanityRequest.data || null,
        vanity_history: vanityAudit.data || [],
        team: team.data || [],
        services: services.data || [],
        stylists: stylists.data || [],
        products: products.data || [],
        recent_bookings: recentBookings.data || [],
        recent_reviews: recentReviews.data || [],
        support_tickets: supportTickets.data || [],
        documents: documents.data || [],
        management_events: mergeById(
          directManagementEvents.data as Row[] | null,
          dependentManagementEvents.data as Row[] | null,
        ),
        registration_identity: registrationIdentity.data || null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "admin-salons",
      action: "load-detail",
      actorRole: "admin",
      salonId,
      recordType: "salon",
      recordId: salonId,
      safeMessage: "We couldn't load this salon's details.",
    });
  }
}

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let admin;
  let actorId: string | null = null;
  let salonId: string | null = null;
  try {
    const context = await requireAdminPermission(request, "salons");
    admin = context.admin;
    actorId = context.user.id;
    const { id } = await params;
    salonId = id;
    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 30);
    if (action === "vanity") {
      const requestId = cleanText(body.request_id, 60);
      const decision = cleanText(body.decision, 20).toLowerCase();
      const approvedSlug = cleanText(body.approved_slug, 80).toLowerCase();
      const note = cleanText(body.note, 500);
      if (!requestId || !["approve", "reject"].includes(decision))
        throw new Error("Choose a pending vanity request and decision.");
      const { data, error } = await admin.rpc(
        "admin_review_salon_vanity_request",
        {
          p_request_id: requestId,
          p_admin_id: actorId,
          p_decision: decision,
          p_approved_slug: approvedSlug || null,
          p_note: note || null,
        },
      );
      if (error) throw error;
      return Response.json({ result: data });
    }
    if (action === "status") {
      const status = cleanText(body.status, 20);
      const reason = cleanText(body.reason, 1000) || null;
      const { data, error } = await admin.rpc("admin_change_salon_status", {
        acting_admin_id: actorId,
        target_salon_id: id,
        requested_status: status,
        internal_reason: reason,
      });
      if (error) throw error;
      return Response.json({ result: data });
    }
    if (action === "geocode") {
      const result = await geocodeSalonAddress(id, { force: true });
      return Response.json({ result });
    }
    if (action === "reconcile") {
      const { data, error } = await admin.rpc("reconcile_salon_publication", {
        p_salon_id: id,
        p_actor_id: actorId,
        p_reason: "Admin requested lifecycle reconciliation",
      });
      if (error) throw error;
      return Response.json({ result: data });
    }
    throw new Error("Unknown salon action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Choose a pending vanity request|Unknown salon action)/i.test(message)) {
      return errorResponse(error, "Unable to update this salon.");
    }
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "admin-salons",
      action: "update-detail",
      actorRole: "admin",
      actorId,
      salonId,
      recordType: "salon",
      recordId: salonId,
      safeMessage: "We couldn't update this salon.",
    });
  }
}
export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/salons/[id]", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/salons/[id]", "POST"),
  POSTHandler,
);
