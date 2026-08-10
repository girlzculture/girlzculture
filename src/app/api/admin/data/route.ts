import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import {
  complaintSupportTicketFilter,
  ordinarySupportTicketFilter,
} from "@/lib/supportTicketClassification";
import {
  ADMIN_OVERVIEW_PROJECTIONS,
  ADMIN_OVERVIEW_SOURCE_PERMISSIONS,
  ADMIN_SECTION_PROJECTIONS,
  ADMIN_SECTION_SOURCE_PERMISSION_OVERRIDES,
  ADMIN_SECTION_SOURCES,
  ADMIN_SOURCE_LIMIT,
  adminRequestedPrimaryRecord,
  prependRequestedAdminRecord,
} from "@/lib/adminDataProjectionCore";

async function GETHandler(request: Request) {
  try {
    const section =
      new URL(request.url).searchParams.get("section") || "overview";
    const permission = section;
    const { admin, adminUser } = await requireAdminPermission(
      request,
      permission,
    );
    const allSources = [
      ["salons", "name", true],
      ["salon_applications", "submitted_at", true],
      ["customers", "created_at", true],
      ["bookings", "appointment_datetime", true],
      ["reviews", "created_at", true],
      ["support_tickets", "created_at", true],
      ["subscriptions", "updated_at", false],
      ["complaints_log", "created_at", false],
      ["admin_users", "email", false],
      ["salon_promotions", "created_at", false],
      ["blog_posts", "updated_at", false],
      ["admin_settings", "updated_at", false],
      ["billing_events", "event_date", false],
      ["identity_conflict_queue", "email_normalized", false],
      ["subscription_change_requests", "requested_at", false],
      ["review_dispute_events", "created_at", true],
      ["review_moderation_events", "created_at", true],
      ["review_content_moderation_queue", "created_at", true],
      ["review_reply_moderation_queue", "created_at", true],
      ["customer_favorites", "created_at", false],
      ["booking_audit_log", "created_at", false],
      ["admin_security_events", "created_at", false],
    ] as const;
    // Overview is an aggregate presentation, not an implicit permission to
    // download every raw platform table. Include only the five datasets the
    // current overview actually renders, and independently require that
    // dataset's section permission. This prevents an Overview-only user from
    // receiving customers, bookings, applications, or review rows they were
    // never granted access to (and never exposes support, finance, identity,
    // settings, or review-moderation queue records through Overview).
    const access = adminUser as {
      is_super_admin?: boolean;
      permissions?: Record<string, boolean>;
    };
    const requestedTables =
      section === "overview"
        ? Object.entries(ADMIN_OVERVIEW_SOURCE_PERMISSIONS)
            .filter(([, sourcePermission]) =>
              Boolean(
                access.is_super_admin || access.permissions?.[sourcePermission],
              ),
            )
            .map(([table]) => table)
        : (ADMIN_SECTION_SOURCES[section] || []).filter((table) => {
            const sourcePermission =
              ADMIN_SECTION_SOURCE_PERMISSION_OVERRIDES[section]?.[table];
            return !sourcePermission || Boolean(
              access.is_super_admin || access.permissions?.[sourcePermission],
            );
          });
    const sources = allSources.filter(([table]) =>
      requestedTables.includes(table),
    );
    // Return one extra row so the UI can explicitly disclose its bounded
    // administrative view. The former hard 500-row cap was silent and could
    // make totals look authoritative when older records were omitted.
    const results = await Promise.all(
      sources.map(async ([table, order, required]) => {
        const projection = section === "overview"
          ? ADMIN_OVERVIEW_PROJECTIONS[table]
          : ADMIN_SECTION_PROJECTIONS[section]?.[table];
        if (!projection) {
          throw new Error(`ADMIN_DATA_PROJECTION_MISSING:${section}:${table}`);
        }
        let query = admin
          .from(table)
          .select(projection);
        if (table === "salons") query = query.is("deleted_at", null);
        if (
          table === "support_tickets" &&
          (section === "support" || section === "customers")
        ) {
          query = query
            .is("complaint_id", null)
            .or(ordinarySupportTicketFilter);
        }
        if (table === "support_tickets" && section === "complaints") {
          query = query.or(complaintSupportTicketFilter);
        }
        if (table === "admin_users" && (section === "support" || section === "complaints")) {
          query = query.eq("status", "Active");
        }
        const result = await query
          .order(order, { ascending: false })
          .limit(ADMIN_SOURCE_LIMIT + 1);
        if (result.error && !required) {
          noteOperationalFailure("Optional admin data source unavailable", {
            table,
            error: result.error,
          });
          return { data: [], error: null, hasMore: false };
        }
        const sourceRows = (result.data || []) as unknown as Array<
          Record<string, unknown>
        >;
        return {
          data: sourceRows.slice(0, ADMIN_SOURCE_LIMIT),
          error: result.error,
          hasMore: sourceRows.length > ADMIN_SOURCE_LIMIT,
        };
      }),
    );
    const requestedPrimary = adminRequestedPrimaryRecord(
      section,
      new URL(request.url).searchParams.get("record_id"),
    );
    if (
      requestedPrimary &&
      requestedPrimary.permission === permission &&
      requestedTables.includes(requestedPrimary.table)
    ) {
      const projection = ADMIN_SECTION_PROJECTIONS[section]?.[requestedPrimary.table];
      if (!projection) {
        throw new Error(
          `ADMIN_DATA_PRIMARY_PROJECTION_MISSING:${section}:${requestedPrimary.table}`,
        );
      }
      let requestedQuery = admin
        .from(requestedPrimary.table)
        .select(projection)
        .eq("id", requestedPrimary.recordId);
      if (requestedPrimary.table === "salons") {
        requestedQuery = requestedQuery.is("deleted_at", null);
      }
      if (requestedPrimary.table === "support_tickets" && section === "support") {
        // A complaint-linked ticket may never be recovered through a Support
        // deep link, even when the caller knows its UUID.
        requestedQuery = requestedQuery
          .is("complaint_id", null)
          .or(ordinarySupportTicketFilter);
      }
      const requestedResult = await requestedQuery.maybeSingle();
      if (requestedResult.error) throw requestedResult.error;
      const requestedRow = requestedResult.data as unknown as Record<
        string,
        unknown
      > | null;
      if (requestedRow) {
        const sourceIndex = sources.findIndex(
          ([table]) => table === requestedPrimary.table,
        );
        if (sourceIndex >= 0) {
          const currentRows = results[sourceIndex].data || [];
          const alreadyIncluded = currentRows.some(
            (row) => String(row.id) === String(requestedRow.id),
          );
          results[sourceIndex].data = prependRequestedAdminRecord(
            currentRows,
            requestedRow,
            ADMIN_SOURCE_LIMIT,
          );
          if (!alreadyIncluded && currentRows.length >= ADMIN_SOURCE_LIMIT) {
            results[sourceIndex].hasMore = true;
          }
        }
      }
    }
    // Keep the response shape stable for every section. Most admin routes only
    // fetch the tables they need, but every consumer can safely render an empty
    // state when another dataset is absent.
    const payload: Record<string, unknown> = Object.fromEntries(
      allSources.map(([table]) => [table, []]),
    );
    const sourceLimits: Record<string, { returned: number; limit: number; has_more: boolean }> = {};
    results.forEach((result, index) => {
      if (result.error) throw result.error;
      payload[sources[index][0]] = result.data || [];
      sourceLimits[sources[index][0]] = {
        returned: (result.data || []).length,
        limit: ADMIN_SOURCE_LIMIT,
        has_more: Boolean(result.hasMore),
      };
    });
    const chunks = <T,>(items: T[], size = 100) => Array.from(
      { length: Math.ceil(items.length / size) },
      (_, index) => items.slice(index * size, (index + 1) * size),
    );
    const exactRows = async (
      table: string,
      projection: string,
      column: string,
      ids: string[],
    ) => {
      const uniqueIds = [...new Set(ids.filter(Boolean))];
      if (!uniqueIds.length) return [] as Array<Record<string, unknown>>;
      const batches = await Promise.all(chunks(uniqueIds).map(async (batch) => {
        const result = await admin.from(table).select(projection).in(column, batch);
        if (result.error) throw result.error;
        return (result.data || []) as unknown as Array<Record<string, unknown>>;
      }));
      return batches.flat();
    };
    const exactValueRows = async (
      table: string,
      projection: string,
      column: string,
      value: string,
      caseInsensitive = false,
    ) => {
      if (!value) return [] as Array<Record<string, unknown>>;
      const query = admin.from(table).select(projection);
      const result = caseInsensitive
        ? await query.ilike(column, value)
        : await query.eq(column, value);
      if (result.error) throw result.error;
      return (result.data || []) as unknown as Array<Record<string, unknown>>;
    };
    const deduplicate = (rows: Array<Record<string, unknown>>) => [...new Map(
      rows.map((row, index) => [String(row.id || `${index}:${JSON.stringify(row)}`), row]),
    ).values()];
    const markExact = (table: string) => {
      sourceLimits[table] = {
        returned: Array.isArray(payload[table]) ? payload[table].length : 0,
        limit: 0,
        has_more: false,
      };
    };
    if (section === "complaints") {
      const complaintRows = Array.isArray(payload.complaints_log)
        ? payload.complaints_log as Array<Record<string, unknown>>
        : [];
      const complaintIds = complaintRows.map((row) => String(row.id || "")).filter(Boolean);
      const supportTicketIds = complaintRows.map((row) => String(row.support_ticket_id || "")).filter(Boolean);
      const bookingIds = complaintRows.map((row) => String(row.booking_id || "")).filter(Boolean);
      const complaintProjections = ADMIN_SECTION_PROJECTIONS.complaints;
      const [ticketsById, ticketsByComplaint, scopedBookings] = await Promise.all([
        exactRows("support_tickets", complaintProjections.support_tickets, "id", supportTicketIds),
        exactRows("support_tickets", complaintProjections.support_tickets, "complaint_id", complaintIds),
        exactRows("bookings", complaintProjections.bookings, "id", bookingIds),
      ]);
      payload.support_tickets = deduplicate([...ticketsById, ...ticketsByComplaint]);
      payload.bookings = scopedBookings;
      const salonIds = new Set([
        ...complaintRows.map((row) => String(row.salon_id || "")),
        ...scopedBookings.map((row) => String(row.salon_id || "")),
      ].filter(Boolean));
      const customerIds = new Set([
        ...complaintRows.map((row) => String(row.customer_id || "")),
        ...scopedBookings.map((row) => String(row.customer_id || "")),
      ].filter(Boolean));
      [payload.salons, payload.customers] = await Promise.all([
        exactRows("salons", complaintProjections.salons, "id", [...salonIds]),
        exactRows("customers", complaintProjections.customers, "id", [...customerIds]),
      ]);
      for (const table of ["support_tickets", "bookings", "salons", "customers"]) {
        markExact(table);
      }
    }
    // Focused record workspaces must hydrate the complete relationship set for
    // that record. They never derive linked evidence from the bounded landing
    // collection, which can otherwise omit valid older rows.
    if (requestedPrimary?.table === "customers") {
      const customer = (payload.customers as Array<Record<string, unknown>>)
        .find((row) => String(row.id) === requestedPrimary.recordId);
      if (customer) {
        const customerId = String(customer.id);
        const email = String(customer.email || "").trim();
        const projections = ADMIN_SECTION_PROJECTIONS.customers;
        const [bookingsById, bookingsByEmail, reviews, favorites] = await Promise.all([
          exactRows("bookings", projections.bookings, "customer_id", [customerId]),
          exactValueRows("bookings", projections.bookings, "guest_email", email, true),
          exactRows("reviews", projections.reviews, "customer_id", [customerId]),
          exactRows("customer_favorites", projections.customer_favorites, "customer_id", [customerId]),
        ]);
        payload.bookings = deduplicate([...bookingsById, ...bookingsByEmail]);
        payload.reviews = reviews;
        payload.customer_favorites = favorites;
        if (requestedTables.includes("support_tickets")) {
          const [ticketsById, ticketsByEmail] = await Promise.all([
            exactRows("support_tickets", projections.support_tickets, "customer_id", [customerId]),
            exactValueRows("support_tickets", projections.support_tickets, "requester_email", email, true),
          ]);
          payload.support_tickets = deduplicate([...ticketsById, ...ticketsByEmail])
            .filter((row) => !row.complaint_id && !/complaint/i.test(String(row.category || "")));
          markExact("support_tickets");
        }
        if (requestedTables.includes("complaints_log")) {
          const [complaintsById, complaintsByEmail] = await Promise.all([
            exactRows("complaints_log", projections.complaints_log, "customer_id", [customerId]),
            exactValueRows("complaints_log", projections.complaints_log, "complainant_email", email, true),
          ]);
          payload.complaints_log = deduplicate([...complaintsById, ...complaintsByEmail]);
          markExact("complaints_log");
        }
        const relatedSalonIds = deduplicate([
          ...(payload.bookings as Array<Record<string, unknown>>),
          ...favorites,
          ...reviews,
          ...(Array.isArray(payload.complaints_log) ? payload.complaints_log as Array<Record<string, unknown>> : []),
        ]).map((row) => String(row.salon_id || "")).filter(Boolean);
        payload.salons = await exactRows("salons", projections.salons, "id", relatedSalonIds);
        for (const table of ["bookings", "reviews", "customer_favorites", "salons"]) markExact(table);
      }
    }
    if (requestedPrimary?.table === "bookings") {
      const booking = (payload.bookings as Array<Record<string, unknown>>)
        .find((row) => String(row.id) === requestedPrimary.recordId);
      if (booking) {
        const projections = ADMIN_SECTION_PROJECTIONS.bookings;
        payload.booking_audit_log = await exactRows("booking_audit_log", projections.booking_audit_log, "booking_id", [String(booking.id)]);
        payload.salons = await exactRows("salons", projections.salons, "id", [String(booking.salon_id || "")]);
        markExact("booking_audit_log");
        markExact("salons");
      }
    }
    if (section === "quality") {
      const salonIds = (payload.salons as Array<Record<string, unknown>>)
        .map((salon) => String(salon.id || ""))
        .filter(Boolean);
      payload.quality_metrics = await exactRows(
        "salon_quality_metrics",
        "salon_id,total_bookings,completed_bookings,salon_cancellations,cancellation_rate_percent,on_time_measured,on_time_rate_percent,active_complaints,complaint_free_rate_percent,rating_overall,review_count,composite_quality_score,cancellation_threshold_percent,measurement_window_start,measurement_window_end",
        "salon_id",
        salonIds,
      );
    }
    if (requestedPrimary?.table === "reviews") {
      const review = (payload.reviews as Array<Record<string, unknown>>)
        .find((row) => String(row.id) === requestedPrimary.recordId);
      if (review) {
        const projections = ADMIN_SECTION_PROJECTIONS.reviews;
        const reviewId = String(review.id);
        const [events, moderationEvents, contentQueue, replyQueue, booking, salon] = await Promise.all([
          exactRows("review_dispute_events", projections.review_dispute_events, "review_id", [reviewId]),
          exactRows("review_moderation_events", projections.review_moderation_events, "review_id", [reviewId]),
          exactRows("review_content_moderation_queue", projections.review_content_moderation_queue, "review_id", [reviewId]),
          exactRows("review_reply_moderation_queue", projections.review_reply_moderation_queue, "review_id", [reviewId]),
          exactRows("bookings", projections.bookings, "id", [String(review.booking_id || "")]),
          exactRows("salons", projections.salons, "id", [String(review.salon_id || "")]),
        ]);
        payload.review_dispute_events = events;
        payload.review_moderation_events = moderationEvents;
        payload.review_content_moderation_queue = contentQueue;
        payload.review_reply_moderation_queue = replyQueue;
        payload.bookings = booking;
        payload.salons = salon;
        for (const table of ["review_dispute_events", "review_moderation_events", "review_content_moderation_queue", "review_reply_moderation_queue", "bookings", "salons"]) markExact(table);
      }
    }
    if (requestedPrimary?.table === "subscriptions") {
      const subscription = (payload.subscriptions as Array<Record<string, unknown>>)
        .find((row) => String(row.id) === requestedPrimary.recordId);
      if (subscription) {
        const projections = ADMIN_SECTION_PROJECTIONS.subscriptions;
        const salonId = String(subscription.salon_id || "");
        [payload.billing_events, payload.subscription_change_requests, payload.salons] = await Promise.all([
          exactRows("billing_events", projections.billing_events, "salon_id", [salonId]),
          exactRows("subscription_change_requests", projections.subscription_change_requests, "salon_id", [salonId]),
          exactRows("salons", projections.salons, "id", [salonId]),
        ]);
        for (const table of ["billing_events", "subscription_change_requests", "salons"]) markExact(table);
      }
    }
    payload.admin_data_meta = { source_limits: sourceLimits };
    const applications = Array.isArray(payload.salon_applications)
      ? (payload.salon_applications as Array<Record<string, unknown>>)
      : [];
    const salonById = new Map(
      (Array.isArray(payload.salons) ? payload.salons : []).map((salon) => [
        String((salon as Record<string, unknown>).id || ""),
        salon as Record<string, unknown>,
      ]),
    );
    applications.forEach((application) => {
      const salon = salonById.get(String(application.salon_id || ""));
      application.marketplace_status = salon?.status || null;
      application.approval_status = application.status;
      application.status =
        String(salon?.status || "").toLowerCase() === "offboarded"
          ? "Offboarded"
          : application.status;
    });
    await Promise.all(
      applications.map(async (application) => {
        const paths = Array.isArray(application.document_urls)
          ? application.document_urls.map(String)
          : [];
        const signed = await Promise.all(
          paths.map(async (path) => {
            if (/^https?:\/\//i.test(path)) return path;
            const { data, error } = await admin.storage
              .from("application-documents")
              .createSignedUrl(path, 3600);
            if (error) {
              noteOperationalFailure("Application document signing failed", {
                applicationId: application.id,
                path,
                error,
              });
              return null;
            }
            return data.signedUrl;
          }),
        );
        application.document_urls = signed.filter(Boolean);
      }),
    );
    return Response.json(payload);
  } catch (error) {
    noteOperationalFailure("Admin data load failed", error);
    // Let the shared monitoring wrapper preserve true 401/403 authorization
    // responses while classifying database/schema failures as safe HTTP 500s.
    // Returning every error as 403 made a broken query look like a login issue.
    throw error;
  }
}
export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/data", "GET"),
  GETHandler,
);
