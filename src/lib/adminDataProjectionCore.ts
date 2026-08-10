export const ADMIN_SOURCE_LIMIT = 500;

export const ADMIN_OVERVIEW_SOURCE_PERMISSIONS: Record<string, string> = {
  salons: "salons",
  salon_applications: "submissions",
  customers: "customers",
  bookings: "bookings",
  reviews: "reviews",
};

export const ADMIN_OVERVIEW_PROJECTIONS: Record<string, string> = {
  salons: "id,status,rating_overall,review_count",
  salon_applications: "id,business_name,status,submitted_at",
  customers: "id,created_at",
  bookings:
    "id,status,appointment_datetime,created_at,estimated_total,deposit_amount,deposit_status",
  reviews: "id,rating_overall,dispute_status,created_at",
};

export const ADMIN_SECTION_SOURCES: Record<string, readonly string[]> = {
  overview: [],
  submissions: ["salon_applications", "salons"],
  salons: [],
  customers: [
    "customers",
    "bookings",
    "reviews",
    "support_tickets",
    "complaints_log",
    "customer_favorites",
    "salons",
  ],
  bookings: ["bookings", "salons", "booking_audit_log"],
  quality: ["salons", "bookings", "reviews", "complaints_log", "admin_settings"],
  reviews: [
    "reviews",
    "salons",
    "bookings",
    "review_dispute_events",
    "review_moderation_events",
    "review_content_moderation_queue",
    "review_reply_moderation_queue",
  ],
  finance: [
    "subscriptions",
    "salons",
    "billing_events",
    "subscription_change_requests",
  ],
  marketing: ["salon_promotions", "blog_posts", "salons"],
  content: [],
  support: ["support_tickets", "admin_users"],
  complaints: [
    "complaints_log",
    "support_tickets",
    "bookings",
    "salons",
    "customers",
    "admin_users",
  ],
  subscriptions: [
    "subscriptions",
    "salons",
    "billing_events",
    "subscription_change_requests",
  ],
  engine: [],
  settings: [
    "admin_users",
    "admin_settings",
    "identity_conflict_queue",
    "admin_security_events",
  ],
};

const applicationProjection = [
  "id",
  "salon_id",
  "business_name",
  "owner_name",
  "business_email",
  "phone",
  "street_address",
  "address_line2",
  "city",
  "state",
  "zip_code",
  "neighborhood",
  "business_type",
  "years_in_operation",
  "stylist_count",
  "website_url",
  "instagram_url",
  "business_license_number",
  "cosmetology_license_number",
  "selected_plan",
  "logo_url",
  "photo_urls",
  "document_urls",
  "status",
  "rejection_reason",
  "submitted_at",
  "reviewed_at",
  "archived_at",
].join(",");

const subscriptionProjection = [
  "id",
  "salon_id",
  "tier",
  "status",
  "created_at",
  "updated_at",
  "current_period_start",
  "current_period_end",
  "cancel_at_period_end",
  "scheduled_tier",
  "stripe_subscription_id",
].join(",");

const billingProjection = [
  "id",
  "salon_id",
  "salon_name",
  "state",
  "market_snapshot",
  "event_type",
  "event_date",
  "previous_plan",
  "new_plan",
  "change_timing",
  "effective_at",
  "paid_through_date",
  "amount_collected",
  "amount_refunded",
  "amount_credited",
  "currency",
  "payment_status",
  "failure_reason",
  "stripe_event_id",
  "stripe_invoice_id",
  "stripe_subscription_id",
].join(",");

const subscriptionChangeProjection = [
  "id",
  "salon_id",
  "previous_plan",
  "new_plan",
  "status",
  "requested_at",
  "effective_at",
  "change_timing",
  "event_source",
  "failure_reason",
  "proration_credit",
  "proration_charge",
  "amount_collected",
  "amount_pending",
  "currency",
  "stripe_invoice_id",
  "stripe_payment_reference",
].join(",");

const supportProjection = [
  "id",
  "customer_id",
  "salon_id",
  "subject",
  "status",
  "requester_name",
  "requester_email",
  "category",
  "message",
  "admin_response",
  "complaint_id",
  "booking_verified",
  "admin_read_at",
  "admin_read_by",
  "responded_by",
  "responded_at",
  "assigned_to",
  "assigned_at",
  "priority",
  "content_moderation_status",
  "content_moderation_reason",
  "created_at",
  "updated_at",
].join(",");

const complaintProjection = [
  "id",
  "category",
  "type",
  "description",
  "issue_description",
  "status",
  "complainant_name",
  "complainant_email",
  "booking_verified",
  "support_ticket_id",
  "booking_id",
  "salon_id",
  "customer_id",
  "created_at",
  "content_moderation_status",
  "content_moderation_reason",
].join(",");

const adminUserProjection = [
  "id",
  "user_id",
  "name",
  "email",
  "phone",
  "status",
  "role",
  "is_super_admin",
  "permissions",
  "invited_at",
  "created_at",
  "activated_at",
  "time_zone",
].join(",");

export const ADMIN_SECTION_PROJECTIONS: Record<string, Record<string, string>> = {
  overview: {},
  submissions: {
    salon_applications: applicationProjection,
    salons: "id,name,status",
  },
  salons: {},
  customers: {
    customers: "id,name,email,status,created_at",
    bookings:
      "id,salon_id,customer_id,guest_email,appointment_datetime,created_at,status,public_reference,confirmation_code",
    reviews: "id,salon_id,customer_id,rating_overall,written_review,created_at",
    support_tickets:
      "id,customer_id,requester_email,subject,status,category,complaint_id,created_at",
    complaints_log:
      "id,salon_id,customer_id,complainant_email,category,type,status,created_at",
    customer_favorites: "customer_id,salon_id,created_at",
    salons: "id,name",
  },
  bookings: {
    bookings:
      "id,salon_id,customer_id,guest_name,guest_email,public_reference,confirmation_code,appointment_datetime,status,deposit_amount,deposit_status,created_at",
    salons: "id,name,time_zone",
    booking_audit_log: "id,booking_id,actor_role,action,reason,created_at",
  },
  quality: {
    salons:
      "id,name,address_state,state:address_state,address_city,city:address_city,neighborhood,status,rating_overall,review_count",
    bookings:
      "id,salon_id,status,cancelled_by,cancellation_initiated_by,service_started_at,appointment_datetime",
    reviews:
      "id,salon_id,moderation_status,dispute_status,written_review,created_at,rating_overall",
    complaints_log: "id,booking_id,salon_id,status,booking_verified",
    admin_settings: "key,value,updated_at",
  },
  reviews: {
    reviews:
      "id,salon_id,booking_id,customer_id,display_name,written_review,rating_overall,created_at,moderation_status,dispute_status,dispute_reason",
    salons: "id,name,time_zone",
    bookings:
      "id,public_reference,confirmation_code,appointment_datetime,status,deposit_amount,deposit_status,salon_id,customer_id",
    review_dispute_events:
      "id,review_id,booking_id,salon_id,action,reason,actor_role,created_at",
    review_moderation_events:
      "id,review_id,action,reason,actor_role,created_at",
    review_content_moderation_queue:
      "id,review_id,status,submitted_display_name,submitted_review_title,submitted_written_review,detection_reason,created_at",
    review_reply_moderation_queue:
      "id,review_id,status,submitted_reply,detection_reason,created_at",
  },
  finance: {
    subscriptions: subscriptionProjection,
    salons:
      "id,name,address_state,state:address_state,subscription_tier",
    billing_events: billingProjection,
    subscription_change_requests: subscriptionChangeProjection,
  },
  marketing: {
    salon_promotions: "id,title,status,created_at",
    blog_posts: "id,title,status,updated_at",
    salons: "id,name,featured_weight",
  },
  content: {},
  support: {
    support_tickets: supportProjection,
    admin_users: "id,user_id,name,email,status",
  },
  complaints: {
    complaints_log: complaintProjection,
    support_tickets: supportProjection,
    bookings:
      "id,salon_id,customer_id,guest_name,confirmation_code,appointment_datetime,status",
    salons: "id,name",
    customers: "id,name,email",
    admin_users: "id,user_id,name,email,status",
  },
  subscriptions: {
    subscriptions: subscriptionProjection,
    salons:
      "id,name,address_state,state:address_state,subscription_tier",
    billing_events: billingProjection,
    subscription_change_requests: subscriptionChangeProjection,
  },
  engine: {},
  settings: {
    admin_users: adminUserProjection,
    admin_settings: "key,value,updated_at",
    identity_conflict_queue:
      "email_normalized,user_ids,roles,resolution_status,canonical_user_id,resolution_action,resolved_at",
    admin_security_events:
      "id,actor_user_id,target_user_id,action,result,created_at",
  },
};

// These two customer-workspace sources contain separately permissioned case
// records. A Customers-only administrator may inspect the customer account and
// booking history, but cannot inherit Support or Complaints access from that
// relationship.
export const ADMIN_SECTION_SOURCE_PERMISSION_OVERRIDES: Record<
  string,
  Record<string, string>
> = {
  customers: {
    support_tickets: "support",
    complaints_log: "complaints",
  },
};

type PrimaryRecordSource = {
  table: string;
  permission: string;
  prefix?: string;
};

export const ADMIN_PRIMARY_RECORD_SOURCES: Record<string, PrimaryRecordSource> = {
  submissions: { table: "salon_applications", permission: "submissions" },
  customers: { table: "customers", permission: "customers" },
  bookings: { table: "bookings", permission: "bookings" },
  quality: { table: "salons", permission: "quality" },
  reviews: { table: "reviews", permission: "reviews" },
  support: { table: "support_tickets", permission: "support" },
  complaints: { table: "complaints_log", permission: "complaints" },
  subscriptions: { table: "subscriptions", permission: "subscriptions" },
  settings: { table: "admin_users", permission: "settings", prefix: "member-" },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function adminRequestedPrimaryRecord(
  section: string,
  rawRecordId: string | null | undefined,
) {
  const source = ADMIN_PRIMARY_RECORD_SOURCES[section];
  if (!source || !rawRecordId) return null;
  const trimmed = rawRecordId.trim();
  const recordId = source.prefix
    ? trimmed.startsWith(source.prefix)
      ? trimmed.slice(source.prefix.length)
      : ""
    : trimmed;
  if (!UUID_PATTERN.test(recordId)) return null;
  return { ...source, recordId };
}

export function prependRequestedAdminRecord<T extends { id?: unknown }>(
  rows: T[],
  requested: T | null | undefined,
  limit = ADMIN_SOURCE_LIMIT,
) {
  if (!requested || requested.id === null || requested.id === undefined) {
    return rows.slice(0, limit);
  }
  const requestedId = String(requested.id);
  return [
    requested,
    ...rows.filter((row) => String(row.id) !== requestedId),
  ].slice(0, limit);
}
