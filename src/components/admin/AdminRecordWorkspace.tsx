/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Star } from "lucide-react";
import AdminBookingEditor from "@/components/admin/AdminBookingEditor";
import AdminManualBookingWizard from "@/components/admin/AdminManualBookingWizard";
import AdminFeaturedCampaigns from "@/components/admin/AdminFeaturedCampaigns";
import AdminFeaturedProducts from "@/components/admin/AdminFeaturedProducts";
import AdminHomepageMarketing from "@/components/admin/AdminHomepageMarketing";
import AdminPromoCodes from "@/components/admin/AdminPromoCodes";
import AdminFinanceDashboard from "@/components/admin/AdminFinanceDashboard";
import { AdminSalonDetail } from "@/components/admin/AdminSalonsManager";
import AdminTimeZonePreference from "@/components/admin/AdminTimeZonePreference";
import AdminUserActivityTimeline from "@/components/admin/AdminUserActivityTimeline";
import AdminTrendingCampaigns from "@/components/admin/AdminTrendingCampaigns";
import EngineControlCenter from "@/components/admin/EngineControlCenter";
import ErrorMonitoringManager from "@/components/admin/ErrorMonitoringManager";
import SystemStatusManager from "@/components/admin/SystemStatusManager";
import IdentityDeletionManager from "@/components/admin/IdentityDeletionManager";
import { AdminSupportDetail } from "@/components/AdminSupportInbox";
import TeamUserManager from "@/components/auth/TeamUserManager";
import { bookingReference } from "@/lib/bookingReference";
import { formatZonedDate, formatZonedDateTime } from "@/lib/dateTime";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";

type Row = Record<string, any>;
export type AdminRecordData = {
  salons: Row[];
  customers: Row[];
  bookings: Row[];
  reviews: Row[];
  tickets: Row[];
  subscriptions: Row[];
  complaints: Row[];
  reviewEvents: Row[];
  reviewModerationEvents: Row[];
  reviewContentQueue: Row[];
  reviewReplyQueue: Row[];
  favorites: Row[];
  bookingAudits: Row[];
  changeRequests: Row[];
  billingEvents: Row[];
  admins: Row[];
  adminSecurityEvents: Row[];
  qualityMetrics: Row[];
};

const find = (rows: Row[], id: string) => rows.find((row) => String(row.id) === id);
const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (value: unknown) => value ? formatZonedDate(String(value), "America/New_York") : "Not recorded";
const dateTime = (value: unknown, zone?: unknown) => value ? formatZonedDateTime(String(value), String(zone || "America/New_York")) : "Not recorded";

export default function AdminRecordWorkspace({
  section,
  recordId,
  returnTo,
  data,
  onRefresh,
  onRead,
}: {
  section: string;
  recordId: string;
  returnTo: string;
  data: AdminRecordData;
  onRefresh: () => Promise<void>;
  onRead: (mode: "support" | "complaints") => void;
}) {
  return <div data-admin-focused-workspace className="space-y-5">
    {section !== "finance" ? <Link href={returnTo} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 bg-white px-4 text-xs font-bold text-plum">
      <ArrowLeft size={16}/>Back to {section === "quality" ? "Quality & Performance" : section.replaceAll("-", " ")}
    </Link> : null}
    {section === "salons" ? <AdminSalonDetail salonId={recordId} embedded refreshed={onRefresh}/> : null}
    {section === "customers" ? <CustomerDetail customer={find(data.customers, recordId)} data={data}/> : null}
    {section === "bookings" ? recordId === "new" ? <ManualBooking salons={data.salons} onCreated={onRefresh}/> : <AdminBookingEditor bookingId={recordId} close={() => undefined} saved={onRefresh} embedded/> : null}
    {section === "quality" ? <QualityDetail salon={find(data.salons, recordId)} data={data}/> : null}
    {section === "reviews" ? <ReviewDetail review={find(data.reviews, recordId)} data={data} onRefresh={onRefresh}/> : null}
    {section === "finance" ? <AdminFinanceDashboard initialTransactionKey={recordId} returnTo={returnTo}/> : null}
    {section === "support" ? <AdminSupportDetail ticket={find(data.tickets, recordId)} mode="support" assignees={data.admins} onSaved={onRefresh} onRead={onRead}/> : null}
    {section === "complaints" ? <ComplaintDetail complaint={find(data.complaints, recordId)} data={data} onSaved={onRefresh} onRead={onRead}/> : null}
    {section === "subscriptions" ? <SubscriptionDetail subscription={find(data.subscriptions, recordId)} data={data}/> : null}
    {section === "marketing" ? <MarketingEditor recordId={recordId} salons={data.salons}/> : null}
    {section === "settings" ? <SettingsEditor recordId={recordId} data={data}/> : null}
    {section === "engine" ? <EngineEditor recordId={recordId}/> : null}
  </div>;
}

function EngineEditor({ recordId }: { recordId: string }) {
  if (recordId === "incidents") return <ErrorMonitoringManager routeMode/>;
  if (recordId.startsWith("incident-")) return <ErrorMonitoringManager routeMode initialEventId={recordId.slice("incident-".length)}/>;
  if (recordId === "system-status") return <SystemStatusManager/>;
  if (recordId.startsWith("category-") || recordId.startsWith("setting-")) return <EngineControlCenter initialRecordId={recordId}/>;
  return <Missing label="Engine workspace"/>;
}

function Missing({ label }: { label: string }) {
  return <section className="rounded-[14px] border border-dashed border-plum/20 bg-white p-8 text-center"><h2 className="font-serif text-2xl text-plum">{label} unavailable</h2><p className="mt-2 text-sm text-ink/55">The record was removed, is outside this administrator&apos;s permissions, or no longer matches the current view.</p></section>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[14px] border border-plum/10 bg-white p-5"><h2 className="font-serif text-2xl text-plum">{title}</h2><div className="mt-4">{children}</div></section>;
}

function DetailGrid({ values }: { values: Array<[string, unknown]> }) {
  return <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{values.map(([label, value]) => <div key={label} className="rounded-xl bg-cream p-4"><dt className="text-[10px] font-bold uppercase tracking-wider text-ink/50">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-plum">{String(value || "Not recorded")}</dd></div>)}</dl>;
}

function CustomerDetail({ customer, data }: { customer?: Row; data: AdminRecordData }) {
  if (!customer) return <Missing label="Customer"/>;
  const customerEmail = String(customer.email || "").trim().toLowerCase();
  const bookings = data.bookings.filter((row) => row.customer_id === customer.id || String(row.guest_email || "").trim().toLowerCase() === customerEmail);
  const reviews = data.reviews.filter((row) => row.customer_id === customer.id);
  const tickets = data.tickets.filter((row) => row.customer_id === customer.id || String(row.requester_email || "").trim().toLowerCase() === customerEmail);
  const complaints = data.complaints.filter((row) => row.customer_id === customer.id || String(row.complainant_email || "").trim().toLowerCase() === customerEmail);
  const favorites = data.favorites.filter((row) => row.customer_id === customer.id);
  const favoriteSalons = favorites.map((favorite) => find(data.salons, String(favorite.salon_id))).filter(Boolean) as Row[];
  const activity = [
    ...bookings.map((row) => ({ id: `booking-${row.id}`, at: row.created_at || row.appointment_datetime, label: `Booking ${bookingReference(row)}`, meta: row.status || "Created" })),
    ...reviews.map((row) => ({ id: `review-${row.id}`, at: row.created_at, label: "Review submitted", meta: `${Number(row.rating_overall || 0).toFixed(1)} stars` })),
    ...tickets.map((row) => ({ id: `support-${row.id}`, at: row.created_at, label: row.subject || "Support request", meta: row.status || "Open" })),
    ...complaints.map((row) => ({ id: `complaint-${row.id}`, at: row.created_at, label: row.category || row.type || "Complaint", meta: row.status || "Open" })),
  ].filter((row) => row.at).sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
  return <div className="space-y-5">
    <Card title={customer.name || "Customer account"}><DetailGrid values={[["Status", customer.status || "Active"],["Email", customer.email],["Joined", date(customer.created_at)],["Bookings", bookings.length],["Reviews", reviews.length],["Support / complaints", tickets.length + complaints.length]]}/></Card>
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Bookings"><div className="space-y-3">{bookings.slice(0,8).map((booking) => <Link key={booking.id} href={`/admin/bookings/${booking.id}?return=${encodeURIComponent(`/admin/customers/${customer.id}`)}`} className="flex items-center justify-between gap-3 rounded-xl border border-plum/10 p-3 text-xs"><span><b className="text-plum">{bookingReference(booking)}</b><span className="mt-1 block text-ink/55">{dateTime(booking.appointment_datetime)}</span></span><span>{booking.status || "Pending"}</span></Link>)}{!bookings.length ? <p className="text-sm text-ink/55">No bookings are associated with this account.</p> : null}</div></Card>
      <Card title="Reviews"><div className="space-y-3">{reviews.slice(0,8).map((review) => <Link key={review.id} href={`/admin/reviews/${review.id}?return=${encodeURIComponent(`/admin/customers/${customer.id}`)}`} className="block rounded-xl border border-plum/10 p-3 text-xs"><b className="text-plum">{Number(review.rating_overall || 0).toFixed(1)} stars</b><p className="mt-1 line-clamp-2 text-ink/60">{review.written_review || "Rating only"}</p></Link>)}{!reviews.length ? <p className="text-sm text-ink/55">No reviews are associated with this account.</p> : null}</div></Card>
      <Card title="Support & complaints"><div className="space-y-3">{tickets.slice(0,6).map((ticket) => <Link key={ticket.id} href={`/admin/support/${ticket.id}?return=${encodeURIComponent(`/admin/customers/${customer.id}`)}`} className="flex items-center justify-between gap-3 rounded-xl border border-plum/10 p-3 text-xs"><span>{ticket.subject || "Support request"}</span><span>{ticket.status || "Open"}</span></Link>)}{complaints.slice(0,6).map((complaint) => <Link key={complaint.id} href={`/admin/complaints/${complaint.id}?return=${encodeURIComponent(`/admin/customers/${customer.id}`)}`} className="flex items-center justify-between gap-3 rounded-xl border border-plum/10 p-3 text-xs"><span>{complaint.category || complaint.type || "Complaint"}</span><span>{complaint.status || "Open"}</span></Link>)}{!tickets.length && !complaints.length ? <p className="text-sm text-ink/55">No support or complaint history is associated with this account.</p> : null}</div></Card>
      <Card title="Favorites & account activity"><div className="flex flex-wrap gap-2">{favoriteSalons.map((salon) => <Link key={salon.id} href={`/admin/salons/${salon.id}?return=${encodeURIComponent(`/admin/customers/${customer.id}`)}`} className="rounded-full bg-blush px-3 py-2 text-xs font-bold text-plum">{salon.name || "Salon"}</Link>)}{!favoriteSalons.length ? <span className="text-sm text-ink/55">No saved salons.</span> : null}</div><div className="mt-4 space-y-2 border-t border-plum/10 pt-4">{activity.slice(0,10).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-xs"><span>{item.label}</span><span className="text-right text-ink/50">{item.meta} · {date(item.at)}</span></div>)}{!activity.length ? <p className="text-sm text-ink/55">No source-linked activity has been recorded.</p> : null}</div></Card>
    </div>
  </div>;
}

function QualityDetail({ salon, data }: { salon?: Row; data: AdminRecordData }) {
  if (!salon) return <Missing label="Salon performance"/>;
  const metric = data.qualityMetrics.find((row) => row.salon_id === salon.id);
  const terminalCount = Number(metric?.total_bookings || 0);
  const completedCount = Number(metric?.completed_bookings || 0);
  const cancellationRate = terminalCount ? Number(metric?.cancellation_rate_percent || 0) : null;
  const onTimeRate = Number(metric?.on_time_measured || 0) ? Number(metric?.on_time_rate_percent || 0) : null;
  return <div className="space-y-5">
    <Card title={`${salon.name || "Salon"} performance`}><DetailGrid values={[["Rating", Number(metric?.review_count || salon.review_count || 0) ? Number(metric?.rating_overall || salon.rating_overall || 0).toFixed(1) : "Not measured"],["Completed / terminal bookings", `${completedCount} / ${terminalCount}`],["Salon cancellation rate", cancellationRate === null ? "Not measured" : `${cancellationRate.toFixed(1)}%`],["On-time completed starts", onTimeRate === null ? "Not measured" : `${onTimeRate.toFixed(1)}%`],["Active verified complaints", Number(metric?.active_complaints || 0)],["Marketplace status", salon.status]]}/></Card>
    <Card title="Evidence"><p className="text-sm leading-6 text-ink/65">This exact server-side snapshot uses terminal marketplace bookings from the last 365 days. The cancellation denominator includes completed and cancelled appointments; on-time performance uses completed appointments with a recorded service start. Only booking-verified, unresolved complaints contribute.</p><p className="mt-3 text-xs text-ink/50">Window: {date(metric?.measurement_window_start)} through {date(metric?.measurement_window_end)}</p><div className="mt-4 flex flex-wrap gap-2"><Link href={`/admin/salons/${salon.id}?return=${encodeURIComponent(`/admin/quality/${salon.id}`)}`} className="rounded-lg border border-magenta px-4 py-2 text-xs font-bold text-magenta">Open salon workspace</Link><Link href={`/admin/reviews?salon=${salon.id}`} className="rounded-lg border border-plum/15 px-4 py-2 text-xs font-bold text-plum">Review evidence</Link></div></Card>
  </div>;
}

function ComplaintDetail({ complaint, data, onSaved, onRead }: { complaint?: Row; data: AdminRecordData; onSaved: () => Promise<void>; onRead: (mode: "support" | "complaints") => void }) {
  if (!complaint) return <Missing label="Complaint"/>;
  const linkedTicket = data.tickets.find((row) => row.id === complaint.support_ticket_id || row.complaint_id === complaint.id);
  const booking = find(data.bookings, String(complaint.booking_id || ""));
  const salon = find(data.salons, String(complaint.salon_id || booking?.salon_id || ""));
  const customer = find(data.customers, String(complaint.customer_id || ""));
  const description = complaint.issue_description || complaint.description || linkedTicket?.message || "No written description was recorded.";
  return <div className="space-y-5">
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Card title={complaint.category || complaint.type || "Complaint evidence"}><DetailGrid values={[["Status", complaint.status || "Open"],["Severity / category", complaint.category || complaint.type || "Not classified"],["Customer", complaint.complainant_name || customer?.name || "Customer"],["Salon", salon?.name || "Not linked"],["Booking", booking ? bookingReference(booking) : "Not linked"],["Booking verification", complaint.booking_verified ? "Verified" : "Not verified"]]}/><div className="mt-4 rounded-xl border border-plum/10 p-4"><p className="whitespace-pre-wrap text-sm leading-7 text-ink/75">{description}</p></div>{complaint.content_moderation_status === "Flagged" ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm gc-text-danger"><b>Human content review required</b><p className="mt-1">The report was retained for review. It was not discarded by the safety filter.</p></div> : null}</Card>
      <Card title="Verification & source links"><p className="text-sm leading-6 text-ink/65">Only complaints verified against an eligible marketplace booking contribute to automated salon-quality metrics. Unverified reports remain available to support without changing automated scores.</p><div className="mt-4 space-y-2">{booking ? <Link href={`/admin/bookings/${booking.id}?return=${encodeURIComponent(`/admin/complaints/${complaint.id}`)}`} className="block rounded-lg border border-plum/10 p-3 text-xs font-bold text-magenta">Open booking evidence →</Link> : null}{salon ? <Link href={`/admin/salons/${salon.id}?return=${encodeURIComponent(`/admin/complaints/${complaint.id}`)}`} className="block rounded-lg border border-plum/10 p-3 text-xs font-bold text-magenta">Open salon workspace →</Link> : null}{customer ? <Link href={`/admin/customers/${customer.id}?return=${encodeURIComponent(`/admin/complaints/${complaint.id}`)}`} className="block rounded-lg border border-plum/10 p-3 text-xs font-bold text-magenta">Open customer account →</Link> : null}</div><div className="mt-5 border-t border-plum/10 pt-4 text-xs"><div className="flex justify-between gap-3"><span>Complaint received</span><span className="text-ink/50">{dateTime(complaint.created_at)}</span></div>{linkedTicket?.responded_at ? <div className="mt-3 flex justify-between gap-3"><span>Administrator response saved</span><span className="text-ink/50">{dateTime(linkedTicket.responded_at)}</span></div> : null}<div className="mt-3 flex justify-between gap-3"><span>Current decision state</span><span className="text-ink/50">{complaint.status || linkedTicket?.status || "Open"}</span></div></div></Card>
    </div>
    {linkedTicket ? <AdminSupportDetail ticket={linkedTicket} mode="complaints" assignees={data.admins} onSaved={onSaved} onRead={onRead}/> : <section className="rounded-[14px] border border-amber/30 bg-amber/10 p-5"><h2 className="font-serif text-2xl text-plum">Communication unavailable</h2><p className="mt-2 text-sm leading-6 text-ink/65">This retained complaint has no linked support conversation. No response action is shown because there is no verified delivery record to update.</p></section>}
  </div>;
}

function SubscriptionDetail({ subscription, data }: { subscription?: Row; data: AdminRecordData }) {
  if (!subscription) return <Missing label="Subscription"/>;
  const salon = find(data.salons, String(subscription.salon_id));
  const changes = data.changeRequests.filter((row) => row.salon_id === subscription.salon_id).sort((left, right) => new Date(right.requested_at || 0).getTime() - new Date(left.requested_at || 0).getTime());
  const events = data.billingEvents.filter((row) => row.salon_id === subscription.salon_id).sort((left, right) => new Date(right.event_date || 0).getTime() - new Date(left.event_date || 0).getTime());
  return <div className="space-y-5">
    <Card title={`${salon?.name || "Salon"} subscription`}><DetailGrid values={[["Plan", subscription.tier || salon?.subscription_tier],["Provider status", subscription.status],["Current period starts", date(subscription.current_period_start)],["Current period ends", date(subscription.current_period_end)],["Scheduled plan", subscription.scheduled_tier || "None"],["Cancellation scheduled", subscription.cancel_at_period_end ? "Yes" : "No"]]}/><p className="mt-4 rounded-xl bg-cream p-4 text-xs leading-5 text-ink/60"><ShieldCheck size={16} className="mr-2 inline text-magenta"/>Provider identifiers remain restricted to authorized finance workflows. This page shows provider-confirmed business state without exposing credentials or raw provider payloads.</p><div className="mt-4 flex flex-wrap gap-2">{salon ? <Link href={`/admin/finance?salon=${encodeURIComponent(salon.id)}`} className="rounded-lg bg-magenta px-4 py-2 text-xs font-bold text-white">Open filtered finance ledger</Link> : null}<Link href="/admin/engine/category-payments_subscriptions" className="rounded-lg border border-magenta px-4 py-2 text-xs font-bold text-magenta">Open governed subscription settings</Link></div></Card>
    <div className="grid gap-5 xl:grid-cols-2"><Card title="Plan-change history"><div className="space-y-3">{changes.slice(0,12).map((change) => <div key={change.id} className="rounded-xl border border-plum/10 p-4 text-xs"><div className="flex justify-between gap-3"><b className="text-plum">{change.previous_plan || "Previous plan"} → {change.new_plan || "Requested plan"}</b><span>{change.status || "Pending"}</span></div><p className="mt-2 text-ink/55">{dateTime(change.requested_at)} · {change.change_timing || "Timing not recorded"}</p>{change.effective_at ? <p className="mt-1 text-ink/55">Effective {dateTime(change.effective_at)}</p> : null}</div>)}{!changes.length ? <p className="text-sm text-ink/55">No plan-change requests are linked to this subscription.</p> : null}</div></Card><Card title="Provider-confirmed events"><div className="space-y-3">{events.slice(0,12).map((event) => <div key={event.id || event.stripe_event_id} className="rounded-xl border border-plum/10 p-4 text-xs"><div className="flex justify-between gap-3"><b className="text-plum">{event.event_type || "Subscription event"}</b><span>{event.payment_status || "Status not recorded"}</span></div><p className="mt-2 text-ink/55">{dateTime(event.event_date)} · collected {money(Number(event.amount_collected || 0) / 100)}</p></div>)}{!events.length ? <p className="text-sm text-ink/55">No provider-confirmed billing events are linked to this subscription.</p> : null}</div></Card></div>
  </div>;
}

function MarketingEditor({ recordId, salons }: { recordId: string; salons: Row[] }) {
  if (recordId === "featured") return <AdminFeaturedCampaigns/>;
  if (recordId === "products") return <AdminFeaturedProducts/>;
  if (recordId === "trending") return <AdminTrendingCampaigns/>;
  if (recordId === "homepage") return <AdminHomepageMarketing salons={salons}/>;
  if (recordId === "promo-codes") return <AdminPromoCodes/>;
  return <Missing label="Marketing workspace"/>;
}

function SettingsEditor({ recordId, data }: { recordId: string; data: AdminRecordData }) {
  if (recordId === "time-zone") return <AdminTimeZonePreference/>;
  if (recordId === "team") return <TeamUserManager scope="admin"/>;
  if (recordId === "identity") return <IdentityDeletionManager/>;
  if (recordId.startsWith("member-")) {
    const memberId = recordId.slice("member-".length);
    return <div className="space-y-5"><TeamUserManager scope="admin" initialUserId={memberId} showBackLink={false}/>{memberId !== "new" ? <AdminMemberDetail member={find(data.admins, memberId)} data={data}/> : null}</div>;
  }
  return <Missing label="Settings workspace"/>;
}

function AdminMemberDetail({ member }: { member?: Row; data: AdminRecordData }) {
  if (!member) return <Missing label="Administrator"/>;
  const permissions = Object.entries(
    member.permissions && typeof member.permissions === "object"
      ? member.permissions
      : {},
  )
    .filter(([, allowed]) => Boolean(allowed))
    .map(([key]) => key.replaceAll("_", " "));
  return <div className="grid gap-5 xl:grid-cols-[.85fr_1.35fr]">
    <Card title={member.name || member.email || "Administrator"}>
      <DetailGrid values={[
        ["Role", member.is_super_admin ? "Super Admin" : member.role || "Admin"],
        ["Status", member.status || "Invited"],
        ["Email", member.email],
        ["Phone", member.phone || "Not recorded"],
        ["Invited", date(member.invited_at || member.created_at)],
        ["Activated", date(member.activated_at)],
      ]}/>
      <div className="mt-4 rounded-xl bg-cream p-4">
        <b className="text-xs text-plum">Assigned sections</b>
        <div className="mt-2 flex flex-wrap gap-2">
          {member.is_super_admin ? (
            <span className="rounded-full bg-blush px-3 py-1.5 text-xs font-bold text-plum">All platform sections</span>
          ) : permissions.map((permission) => (
            <span key={permission} className="rounded-full bg-blush px-3 py-1.5 text-xs font-bold text-plum">{permission}</span>
          ))}
          {!member.is_super_admin && !permissions.length ? (
            <span className="text-xs text-ink/55">No active section permissions.</span>
          ) : null}
        </div>
      </div>
      <Link href="/admin/settings/team" className="mt-4 inline-flex rounded-lg bg-magenta px-4 py-2 text-xs font-bold text-white">
        Manage invitation, status, and permissions
      </Link>
    </Card>
    <AdminUserActivityTimeline memberId={String(member.id)} />
  </div>;
}

function ManualBooking({ salons, onCreated }: { salons: Row[]; onCreated: () => Promise<void> }) {
  return <AdminManualBookingWizard salons={salons} onCreated={onCreated}/>;
}

function Field({ name, label, type = "text" }: { name: string; label: string; type?: string }) {
  return <label className="text-xs font-bold">{label}<input name={name} type={type} required className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"/></label>;
}

function ReviewDetail({ review, data, onRefresh }: { review?: Row; data: AdminRecordData; onRefresh: () => Promise<void> }) {
  const [action, setAction] = useState("resolved");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const salon = review ? find(data.salons, String(review.salon_id)) : undefined;
  const booking = review ? find(data.bookings, String(review.booking_id)) : undefined;
  const contentQueue = review ? data.reviewContentQueue.find((row) => row.review_id === review.id) : undefined;
  const replyQueue = review ? data.reviewReplyQueue.find((row) => row.review_id === review.id) : undefined;
  const reviewId = String(review?.id || "");
  const events = useMemo(() => reviewId ? [...data.reviewEvents.filter((row) => String(row.review_id) === reviewId), ...data.reviewModerationEvents.filter((row) => String(row.review_id) === reviewId)].sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()) : [], [data.reviewEvents, data.reviewModerationEvents, reviewId]);
  if (!review) return <Missing label="Review"/>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 10) { setMessage("Enter a moderation reason of at least 10 characters."); return; }
    setSaving(true); setMessage("");
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}/moderate`, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "manual", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ action, reason: reason.trim() }) });
      const body = await readApiResponse(response, "The moderation decision could not be completed.");
      if (!response.ok) throw new Error(body.error || "The moderation decision could not be completed.");
      await onRefresh();
      setMessage("Moderation saved, read back, and added to the audit history.");
      setReason("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The moderation decision could not be completed."); }
    finally { setSaving(false); }
  }
  return <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
    <div className="space-y-5"><Card title="Review evidence"><div className="flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-1 font-bold text-amber"><Star size={16} fill="currentColor"/>{Number(review.rating_overall || 0).toFixed(1)}</span><span className="rounded-full bg-blush px-3 py-1 text-xs font-bold text-magenta">{review.moderation_status || "Published"}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7">{review.written_review || "Rating only; no written review was submitted."}</p><DetailGrid values={[["Customer", review.display_name || "Verified client"],["Salon", salon?.name],["Booking", booking ? bookingReference(booking) : "Unavailable"],["Appointment", booking ? dateTime(booking.appointment_datetime, salon?.time_zone) : "Unavailable"],["Deposit", booking ? `${money(booking.deposit_amount)} · ${booking.deposit_status || "Unknown"}` : "Unavailable"],["Dispute", review.dispute_status || "None"]]}/>{contentQueue ? <Evidence label="Written-content queue" value={contentQueue.submitted_written_review || "Rating-only submission"} status={contentQueue.status}/> : null}{replyQueue ? <Evidence label="Salon reply queue" value={replyQueue.submitted_reply} status={replyQueue.status}/> : null}</Card><Card title="Audit timeline">{events.length ? <div className="space-y-3">{events.map((item) => <article key={item.id} className="border-l-2 border-magenta pl-3 text-xs"><b className="capitalize text-plum">{String(item.action || "event").replaceAll("_", " ")}</b><p className="mt-1 text-ink/65">{item.reason || "No reason recorded"}</p><p className="mt-1 text-ink/45">{dateTime(item.created_at)}</p></article>)}</div> : <p className="text-sm text-ink/55">No moderation events have been recorded.</p>}</Card></div>
    <Card title="Moderation decision"><form onSubmit={submit}><label className="text-xs font-bold">Action<select value={action} onChange={(event) => setAction(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal">{contentQueue?.status === "Pending" ? <><option value="approve_content">Approve written content</option><option value="reject_content">Reject written content; keep rating</option></> : null}{replyQueue?.status === "Pending" ? <><option value="approve_reply">Approve salon reply</option><option value="reject_reply">Reject salon reply</option></> : null}<option value="resolved">Resolve and publish</option><option value="hidden">Hide under policy</option><option value="restored">Restore to public</option></select></label><label className="mt-4 block text-xs font-bold">Published reason<textarea required minLength={10} maxLength={1000} rows={6} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal" placeholder="Explain the evidence and policy used."/></label>{message ? <p role="status" className="mt-4 rounded-lg bg-blush/45 p-3 text-sm text-plum">{message}</p> : null}<button disabled={saving} className="mt-4 min-h-11 rounded-lg bg-magenta px-5 text-xs font-bold text-white gc-disabled-control">{saving ? "Saving…" : "Save audited decision"}</button></form></Card>
  </div>;
}

function Evidence({ label, value, status }: { label: string; value: unknown; status: unknown }) {
  return <div className="mt-4 rounded-xl border border-plum/10 bg-cream/60 p-4 text-xs"><div className="flex items-center justify-between gap-3"><b className="text-plum">{label}</b><span>{String(status || "Pending")}</span></div><p className="mt-2 whitespace-pre-wrap leading-5 text-ink/65">{String(value || "No text submitted")}</p></div>;
}
