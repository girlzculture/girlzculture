import { notFound } from "next/navigation";
import AdminDashboard, {
  type AdminAcceptanceData,
  type AdminSection,
} from "@/components/AdminDashboard";

const sections = new Set<AdminSection>([
  "overview",
  "submissions",
  "salons",
  "customers",
  "bookings",
  "quality",
  "reviews",
  "finance",
  "marketing",
  "content",
  "support",
  "complaints",
  "subscriptions",
  "engine",
  "settings",
]);

const acceptanceData: AdminAcceptanceData = {
  salons: [
    {
      id: "salon-1",
      name: "The Braid Lounge",
      status: "Active",
      address_city: "Brooklyn",
      address_state: "New York",
      rating_overall: 4.9,
      review_count: 218,
      subscription_tier: "Growth",
    },
    {
      id: "salon-2",
      name: "Crowned Collective",
      status: "Active",
      address_city: "Atlanta",
      address_state: "Georgia",
      rating_overall: 4.7,
      review_count: 94,
      subscription_tier: "Premium",
    },
  ],
  applications: [
    {
      id: "application-1",
      business_name: "Harlem Braid House",
      owner_name: "Monique Davis",
      business_email: "owner@example.test",
      city: "New York",
      state: "New York",
      status: "Pending",
      submitted_at: "2026-08-06T15:30:00.000Z",
    },
  ],
  customers: [
    {
      id: "customer-1",
      name: "Janel Smith",
      email: "janel@example.test",
      status: "Active",
      created_at: "2026-06-14T12:00:00.000Z",
    },
    {
      id: "customer-2",
      name: "Tiffany Brown",
      email: "tiffany@example.test",
      status: "Inactive",
      created_at: "2026-05-02T12:00:00.000Z",
    },
    ...Array.from({ length: 18 }, (_, index) => ({
      id: `customer-fixture-${index + 3}`,
      name: `Acceptance Customer ${index + 3}`,
      email: `customer-${index + 3}@example.test`,
      status: index % 4 === 0 ? "Inactive" : "Active",
      created_at: `2026-04-${String((index % 27) + 1).padStart(2, "0")}T12:00:00.000Z`,
    })),
  ],
  bookings: [
    {
      id: "booking-1",
      public_reference: "GC-260807-1001",
      salon_id: "salon-1",
      customer_id: "customer-1",
      guest_name: "Janel Smith",
      guest_email: "janel@example.test",
      status: "Confirmed",
      appointment_datetime: "2026-08-15T14:00:00.000Z",
      estimated_total: 240,
      deposit_amount: 24,
      deposit_status: "Paid",
    },
    {
      id: "booking-2",
      public_reference: "GC-260807-1002",
      salon_id: "salon-2",
      customer_id: "customer-2",
      guest_name: "Tiffany Brown",
      guest_email: "tiffany@example.test",
      status: "Completed",
      appointment_datetime: "2026-08-01T17:00:00.000Z",
      estimated_total: 180,
      deposit_amount: 18,
      deposit_status: "Paid",
    },
  ],
  reviews: [
    {
      id: "review-1",
      salon_id: "salon-1",
      customer_id: "customer-1",
      booking_id: "booking-1",
      display_name: "Janel S.",
      rating_overall: 5,
      written_review: "Careful work, clear pricing, and a welcoming appointment.",
      moderation_status: "Published",
      dispute_status: "None",
      created_at: "2026-08-05T12:00:00.000Z",
    },
    {
      id: "review-2",
      salon_id: "salon-2",
      customer_id: "customer-2",
      booking_id: "booking-2",
      display_name: "Tiffany B.",
      rating_overall: 4,
      written_review: "The finished style was beautiful and lasted well.",
      moderation_status: "Under review",
      dispute_status: "Disputed",
      created_at: "2026-08-02T12:00:00.000Z",
    },
  ],
  qualityMetrics: [
    {
      salon_id: "salon-1",
      total_bookings: 142,
      completed_bookings: 137,
      salon_cancellations: 5,
      cancellation_rate_percent: 3.52,
      on_time_measured: 116,
      on_time_rate_percent: 94.83,
      active_complaints: 0,
      complaint_free_rate_percent: 100,
      composite_quality_score: 96.4,
      measurement_window_start: "2025-08-08T00:00:00.000Z",
      measurement_window_end: "2026-08-08T00:00:00.000Z",
    },
    {
      salon_id: "salon-2",
      total_bookings: 96,
      completed_bookings: 84,
      salon_cancellations: 12,
      cancellation_rate_percent: 12.5,
      on_time_measured: 76,
      on_time_rate_percent: 88.16,
      active_complaints: 1,
      complaint_free_rate_percent: 98.96,
      composite_quality_score: 84.7,
      measurement_window_start: "2025-08-08T00:00:00.000Z",
      measurement_window_end: "2026-08-08T00:00:00.000Z",
    },
  ],
  tickets: [
    {
      id: "ticket-1",
      customer_id: "customer-1",
      requester_name: "Janel Smith",
      requester_email: "janel@example.test",
      subject: "Appointment question",
      category: "Booking",
      message: "Please confirm the salon accessibility information.",
      status: "Open",
      created_at: "2026-08-07T13:00:00.000Z",
    },
    {
      id: "ticket-2",
      requester_name: "Tiffany Brown",
      requester_email: "tiffany@example.test",
      subject: "Service quality complaint",
      category: "Complaint",
      message: "The appointment record needs a human quality review.",
      status: "Open",
      booking_verified: true,
      complaint_id: "complaint-1",
      admin_read_at: "2026-08-07T15:55:00.000Z",
      responded_at: "2026-08-07T16:00:00.000Z",
      created_at: "2026-08-06T13:00:00.000Z",
    },
  ],
  subscriptions: [
    {
      id: "subscription-1",
      salon_id: "salon-1",
      tier: "Growth",
      status: "active",
      current_period_start: "2026-08-01T00:00:00.000Z",
      current_period_end: "2026-09-01T00:00:00.000Z",
    },
  ],
  complaints: [
    {
      id: "complaint-1",
      salon_id: "salon-2",
      customer_id: "customer-2",
      booking_id: "booking-2",
      support_ticket_id: "ticket-2",
      category: "Service quality complaint",
      complainant_name: "Tiffany Brown",
      complainant_email: "tiffany@example.test",
      issue_description: "The appointment record needs a human quality review.",
      status: "Open",
      booking_verified: true,
      created_at: "2026-08-04T12:00:00.000Z",
    },
  ],
  promotions: [
    { id: "promotion-1", title: "Back-to-school braids", status: "Active" },
  ],
  posts: [
    { id: "post-1", title: "Protective-style aftercare", status: "Published" },
  ],
  settings: [
    {
      id: "quality_thresholds",
      key: "quality_thresholds",
      value: { salon_cancellation_rate_percent: 10 },
    },
  ],
  billingEvents: [
    { id: "billing-1", salon_id: "salon-1", event_type: "Renewal payment", payment_status: "Paid", amount_collected: 12950, currency: "usd", event_date: "2026-08-01T00:05:00.000Z" },
  ],
  identityConflicts: [],
  changeRequests: [
    { id: "change-1", salon_id: "salon-1", previous_plan: "Basic", new_plan: "Growth", status: "Paid", change_timing: "immediate", requested_at: "2026-07-15T14:00:00.000Z", effective_at: "2026-07-15T14:05:00.000Z" },
  ],
  favorites: [
    { customer_id: "customer-1", salon_id: "salon-1", created_at: "2026-07-01T12:00:00.000Z" },
  ],
  admins: [
    { id: "admin-1", user_id: "admin-1", name: "Jane Admin", email: "jane@example.test", role: "Operations", status: "Active", permissions: { overview: true, customers: true, support: true }, created_at: "2026-05-01T12:00:00.000Z", activated_at: "2026-05-02T12:00:00.000Z" },
  ],
  adminSecurityEvents: [
    { id: "security-1", actor_user_id: "admin-1", target_user_id: "admin-1", action: "admin_permissions_updated", result: "Succeeded", created_at: "2026-08-01T15:00:00.000Z" },
  ],
  bookingAudits: [],
  reviewEvents: [],
  reviewModerationEvents: [],
  reviewContentQueue: [],
  reviewReplyQueue: [],
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminWorkflowAcceptancePage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string; record?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  const route = await params;
  if (!sections.has(route.section as AdminSection)) notFound();
  const section = route.section as AdminSection;
  const recordId = route.record?.[0];
  const query = await searchParams;
  const requestedReturn = first(query.return);
  const fallbackReturn = `/internal/acceptance/admin-workflows/${section}`;
  const returnTo = requestedReturn?.startsWith("/internal/acceptance/admin-workflows/")
    ? requestedReturn
    : fallbackReturn;

  return (
    <AdminDashboard
      section={section}
      recordId={recordId}
      returnTo={returnTo}
      acceptanceData={acceptanceData}
    />
  );
}
