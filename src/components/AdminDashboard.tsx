/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3, Bell, Building2, CalendarDays, CircleDollarSign, ClipboardList, CreditCard,
  FileText, Flag, Headphones, Home, Menu, MessageSquare, Search, Settings, SlidersHorizontal, Star, UsersRound,
} from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import AdminContentManager from "@/components/AdminContentManager";
import AdminSupportInbox from "@/components/AdminSupportInbox";
import RoleLogoutButton, { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";
import AdminSalonsManager from "@/components/admin/AdminSalonsManager";
import AdminMarketingWorkspace from "@/components/admin/AdminMarketingWorkspace";
import AdminFinanceDashboard from "@/components/admin/AdminFinanceDashboard";
import AdminEngineLanding from "@/components/admin/AdminEngineLanding";
import { US_STATES } from "@/lib/usStates";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import DashboardNotificationCenter from "@/components/notifications/DashboardNotificationCenter";
import { bookingReference } from "@/lib/bookingReference";
import { formatZonedDate, formatZonedDateTime } from "@/lib/dateTime";
import NumericInput from "@/components/forms/NumericInput";
import { readApiResponse } from "@/lib/apiResponseClient";
import DashboardMobileMenu from "@/components/dashboard/DashboardMobileMenu";
import AdminSubscriptionsDashboard from "@/components/admin/AdminSubscriptionsDashboard";
import ActionToast from "@/components/ActionToast";
import AdminRecordWorkspace from "@/components/admin/AdminRecordWorkspace";
import {
  rememberAdminListScroll,
  useAdminListContext,
  useAdminListScrollRestoration,
  useAdminQueryParam,
} from "@/components/admin/useAdminListContext";

export type AdminSection = "overview" | "submissions" | "salons" | "customers" | "bookings" | "quality" | "reviews" | "finance" | "marketing" | "content" | "support" | "complaints" | "subscriptions" | "engine" | "settings";
type Row = Record<string, any>;
type DataState = {
  salons: Row[]; applications: Row[]; customers: Row[]; bookings: Row[]; reviews: Row[]; tickets: Row[];
  subscriptions: Row[]; complaints: Row[]; admins: Row[]; promotions: Row[]; posts: Row[]; settings: Row[]; billingEvents: Row[];
  identityConflicts: Row[]; changeRequests: Row[]; reviewEvents: Row[]; reviewModerationEvents: Row[]; reviewContentQueue: Row[]; reviewReplyQueue: Row[];
  favorites: Row[]; bookingAudits: Row[]; adminSecurityEvents: Row[]; qualityMetrics: Row[];
};
type OverviewMetrics = {
  total_salons: number;
  active_salons: number;
  pending_submissions: number;
  total_customers: number;
  total_bookings: number;
  completed_booking_value: number;
  deposits_collected: number;
};
type AdminDataMeta = { source_limits?: Record<string, { returned?: number; limit?: number; has_more?: boolean }> };

/** Synthetic, non-production records used only by the guarded browser harness. */
export type AdminAcceptanceData = Partial<DataState> & { overviewMetrics?: OverviewMetrics };

const emptyData: DataState = { salons: [], applications: [], customers: [], bookings: [], reviews: [], tickets: [], subscriptions: [], complaints: [], admins: [], promotions: [], posts: [], settings: [], billingEvents: [], identityConflicts: [], changeRequests: [], reviewEvents: [], reviewModerationEvents: [], reviewContentQueue: [], reviewReplyQueue: [], favorites: [], bookingAudits: [], adminSecurityEvents: [], qualityMetrics: [] };
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const normalizedData = (value?: AdminAcceptanceData): DataState => ({
  salons: rows(value?.salons), applications: rows(value?.applications), customers: rows(value?.customers),
  bookings: rows(value?.bookings), reviews: rows(value?.reviews), tickets: rows(value?.tickets),
  subscriptions: rows(value?.subscriptions), complaints: rows(value?.complaints), admins: rows(value?.admins),
  promotions: rows(value?.promotions), posts: rows(value?.posts), settings: rows(value?.settings), billingEvents: rows(value?.billingEvents),
  identityConflicts: rows(value?.identityConflicts), changeRequests: rows(value?.changeRequests), reviewEvents: rows(value?.reviewEvents),
  reviewModerationEvents: rows(value?.reviewModerationEvents), reviewContentQueue: rows(value?.reviewContentQueue), reviewReplyQueue: rows(value?.reviewReplyQueue),
  favorites: rows(value?.favorites), bookingAudits: rows(value?.bookingAudits), adminSecurityEvents: rows(value?.adminSecurityEvents), qualityMetrics: rows(value?.qualityMetrics),
});
const navigation: Array<[AdminSection, string, typeof Home]> = [
  ["overview", "Overview", Home], ["submissions", "Submissions", ClipboardList], ["salons", "Salons", Building2],
  ["customers", "Customers", UsersRound], ["bookings", "Bookings", CalendarDays], ["quality", "Quality & Performance", Star],
  ["reviews", "Reviews", MessageSquare], ["finance", "Payments & Finance", CircleDollarSign], ["marketing", "Marketing & Promotions", BarChart3],
  ["content", "Content Management", FileText], ["support", "Customer Support", Headphones], ["complaints", "Complaints", Flag], ["subscriptions", "Subscriptions", CreditCard],
  ["engine", "The Engine", SlidersHorizontal],
  ["settings", "Settings & Team", Settings],
];

const permissionForSection = (section: AdminSection) => section;
type InboxCounts = { support: number; complaints: number };

export default function AdminDashboard({ section, recordId, returnTo, acceptanceData }: { section: AdminSection; preview?: boolean; recordId?: string; returnTo?: string; acceptanceData?: AdminAcceptanceData }) {
  const acceptance = Boolean(acceptanceData);
  const [loading, setLoading] = useState(!acceptance);
  const [error, setError] = useState("");
  const [data, setData] = useState<DataState>(() => normalizedData(acceptanceData));
  const [overviewMetrics, setOverviewMetrics] = useState<OverviewMetrics | null>(acceptanceData?.overviewMetrics || null);
  const [dataMeta, setDataMeta] = useState<AdminDataMeta>({});
  const [selected, setSelected] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [access, setAccess] = useState<Record<string, boolean> | null>(null);
  const [denied, setDenied] = useState(false);
  const [inboxCounts, setInboxCounts] = useState<InboxCounts>({ support: 0, complaints: 0 });
  const landingOwnsAsyncScroll = section === "salons" || section === "finance" || section === "content";
  useAdminListScrollRestoration(!loading && !recordId && !landingOwnsAsyncScroll);

  async function load() {
    if (acceptanceData) {
      const next = normalizedData(acceptanceData);
      setData(next);
      setOverviewMetrics(acceptanceData.overviewMetrics || null);
      setDataMeta({});
      setAccess(null);
      setDenied(false);
      setSelected((current) => current ? next.applications.find((item) => item.id === current.id) || null : next.applications[0] || null);
      return;
    }
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Admin sign-in required. Your salon-owner session remains signed in separately.");
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const verification = await fetch("/api/admin/verify", { method: "POST", headers });
    if (!verification.ok) throw new Error("This saved admin session is no longer authorized. Sign in with an active platform-admin account.");
    const verified = await readApiResponse(
      verification,
      "Unable to verify admin permissions.",
    ) as { permissions?: Record<string,boolean>; is_super_admin?: boolean; error?: string };
    const verifiedAccess = verified.is_super_admin ? null : verified.permissions || {};
    setAccess(verifiedAccess);
    if (verifiedAccess !== null && !verifiedAccess[permissionForSection(section)]) {
      setDenied(true);
      setData(emptyData);
      setSelected(null);
      return;
    }
    setDenied(false);
    const dataParams = new URLSearchParams({ section });
    if (recordId) dataParams.set("record_id", recordId);
    const response = await fetch(`/api/admin/data?${dataParams}`, { headers, cache: "no-store" });
    const body = await readApiResponse(response, "Unable to load admin data.");
    if (!response.ok) throw new Error(body.error || "Unable to load admin data.");
    const next: DataState = {
      salons: rows(body.salons), applications: rows(body.salon_applications), customers: rows(body.customers),
      bookings: rows(body.bookings), reviews: rows(body.reviews), tickets: rows(body.support_tickets),
      subscriptions: rows(body.subscriptions), complaints: rows(body.complaints_log), admins: rows(body.admin_users),
      promotions: rows(body.salon_promotions), posts: rows(body.blog_posts), settings: rows(body.admin_settings), billingEvents: rows(body.billing_events), identityConflicts: rows(body.identity_conflict_queue), changeRequests: rows(body.subscription_change_requests), reviewEvents: rows(body.review_dispute_events), reviewModerationEvents: rows(body.review_moderation_events), reviewContentQueue: rows(body.review_content_moderation_queue), reviewReplyQueue: rows(body.review_reply_moderation_queue),
      favorites: rows(body.customer_favorites), bookingAudits: rows(body.booking_audit_log), adminSecurityEvents: rows(body.admin_security_events), qualityMetrics: rows(body.quality_metrics),
    };
    setData(next);
    setDataMeta(body.admin_data_meta && typeof body.admin_data_meta === "object" ? body.admin_data_meta as AdminDataMeta : {});
    setSelected((current) => current ? next.applications.find((item) => item.id === current.id) || null : next.applications[0] || null);
    if (section === "overview") {
      const metricsResponse = await fetch("/api/admin/overview-metrics", {
        headers,
        cache: "no-store",
        credentials: "same-origin",
      });
      const metricsBody = await readApiResponse(
        metricsResponse,
        "Unable to load authoritative platform totals.",
      ) as { metrics?: OverviewMetrics; error?: string };
      if (!metricsResponse.ok || !metricsBody.metrics) {
        throw new Error(metricsBody.error || "Unable to load authoritative platform totals.");
      }
      setOverviewMetrics(metricsBody.metrics);
    } else {
      setOverviewMetrics(null);
    }
    if (verifiedAccess === null || verifiedAccess.support || verifiedAccess.complaints) {
      const countsResponse = await fetch("/api/admin/inbox-counts", { headers, cache: "no-store" });
      if (countsResponse.ok) {
        const counts = await countsResponse.json() as Partial<InboxCounts>;
        setInboxCounts({ support: Number(counts.support || 0), complaints: Number(counts.complaints || 0) });
      }
    }
  }

  useEffect(() => {
    if (acceptanceData) return;
    let active = true;
    (async () => {
      try { await load(); }
      catch (loadError) { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load admin data."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  // The selected section is fixed for each route-mounted dashboard instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptanceData]);

  async function decide(id: string, decision: "approve" | "reject" | "activate") {
    const reason = decision === "reject" ? window.prompt("Reason for rejection:") || "Application did not meet current requirements." : undefined;
    const session = await getSessionForScope("admin");
    if (!session) { setNotice("Your admin session has expired."); return; }
    const response = await fetch(`/api/admin/submissions/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ decision, reason }) });
    const body = await readApiResponse(
      response,
      "Unable to update application.",
    );
    if (!response.ok) {
      const missing = Array.isArray(body.missing) ? body.missing.map(String) : [];
      setNotice(
        missing.length
          ? `${body.error || "Publication requirements remain."} Missing: ${missing.join(", ")}.`
          : body.error || "Unable to update application.",
      );
      return;
    }
    await load();
    setNotice(
      decision === "activate"
        ? body.idempotent
          ? "The salon was already active and public. No duplicate action was recorded."
          : "Every required publication gate passed and the salon is now public."
        : `Application ${String(body.status).toLowerCase()}.`,
    );
  }

  async function update(table: string, id: string, changes: Row) {
    if (table !== "admin_settings" || id !== "quality_thresholds") {
      setNotice("This update must be completed from its protected record workspace.");
      return;
    }
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const response = await fetch("/api/admin/quality/thresholds", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(changes.value || {}) });
      const body = await readApiResponse(response, "Unable to save quality thresholds.");
      if (!response.ok) throw new Error(body.error || "Unable to save quality thresholds.");
      await load();
      setNotice("Quality thresholds saved and read back successfully.");
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : "Unable to save quality thresholds.");
    }
  }

  if (loading) return <div className="min-h-screen bg-cream p-12 text-center text-plum">Loading platform administration…</div>;
  if (error) return <div className="grid min-h-screen place-items-center bg-cream p-5"><div className="rounded-2xl bg-white p-8 text-center"><h1 className="font-serif text-3xl text-plum">Admin access</h1><p className="mt-3">{error}</p><Link href="/admin/login" className="mt-5 inline-flex rounded-lg bg-magenta px-5 py-3 text-sm font-bold text-white">Go to admin login</Link></div></div>;
  if (denied) {
    const firstAllowed = navigation.find(([id]) => access?.[permissionForSection(id)])?.[0];
    const firstAllowedHref = firstAllowed === "overview" ? "/admin" : firstAllowed ? `/admin/${firstAllowed}` : "/admin/login";
    return <AdminShell section={section} access={access} inboxCounts={inboxCounts} acceptance={acceptance}>{acceptance ? null : <RoleSessionBoundary scope="admin" />}<div className="mx-auto max-w-2xl rounded-[18px] border border-plum/10 bg-white p-10 text-center"><Settings className="mx-auto text-magenta" /><h1 className="mt-4 font-serif text-3xl text-plum">Access not assigned</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-ink/70">Your platform-admin role does not include this section. Ask a Super Admin to update your permissions.</p><Link href={firstAllowedHref} className="mt-5 inline-flex rounded-lg bg-magenta px-5 py-3 font-bold text-white">Open an assigned section</Link></div></AdminShell>;
  }

  return <AdminShell section={section} access={access} inboxCounts={inboxCounts} acceptance={acceptance}>{acceptance ? null : <RoleSessionBoundary scope="admin" />}
    <div data-language-selector-host className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-serif text-[40px] font-semibold leading-none text-plum">{navigation.find((item) => item[0] === section)?.[1]}</h1><p className="mt-2 text-sm text-ink/55">{subtitle(section)}</p></div><LanguageSelector compact/></div>
    <ActionToast message={notice} onDismiss={() => setNotice("")} />
    <AdminDataBoundaryNotice meta={dataMeta}/>
    <div onClickCapture={rememberAdminListScroll}>
      <AdminSectionView section={section} recordId={recordId} returnTo={returnTo} data={data} overviewMetrics={overviewMetrics} selected={selected} setSelected={setSelected} decide={decide} update={update} onCreated={load} onTicketRead={(mode) => setInboxCounts((counts) => ({ ...counts, [mode]: Math.max(0, counts[mode] - 1) }))} />
    </div>
  </AdminShell>;
}

function AdminShell({ section, children, access, inboxCounts, acceptance = false }: { section: AdminSection; children: React.ReactNode; access: Record<string,boolean>|null; inboxCounts: InboxCounts; acceptance?: boolean }) {
  const [notificationCounts,setNotificationCounts]=useState<Record<string,number>>({});
  const handleNotificationCounts=useCallback((counts:Record<string,number>)=>setNotificationCounts(counts),[]);
  const visibleNavigation = access === null ? navigation : navigation.filter(([id]) => access[permissionForSection(id)]);
  const mobileNavigation = ([
    ["overview", "Overview", Home], ["bookings", "Bookings", CalendarDays], ["submissions", "Alerts", Bell], ["quality", "Reports", BarChart3], ["settings", "More", Menu],
  ] as Array<[AdminSection, string, typeof Home]>).filter(([id]) => access === null || access[permissionForSection(id)]);
  const homeId = visibleNavigation[0]?.[0];
  const homeHref = homeId === "overview" ? "/admin" : homeId ? `/admin/${homeId}` : "/admin/login";
  const navCount = (id: AdminSection) => {
    const notificationCount=id==="bookings"?notificationCounts.bookings:id==="finance"?notificationCounts.payments:id==="support"?notificationCounts.support:id==="submissions"?notificationCounts.lifecycle:id==="engine"||id==="overview"?notificationCounts.errors:0;
    return Number(notificationCount||0)+(id==="support"?inboxCounts.support:id==="complaints"?inboxCounts.complaints:0);
  };
  return <div data-admin-acceptance={acceptance || undefined} className="min-h-screen bg-cream text-ink lg:grid lg:grid-cols-[220px_1fr]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col bg-charcoal p-4 text-white lg:flex">
      <Link href={homeHref} className="block flex-none px-3 py-4 font-serif text-2xl font-bold">Girlz Culture</Link>
      <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-3">{visibleNavigation.map(([id, label, Icon]) => <Link key={id} href={id === "overview" ? "/admin" : `/admin/${id}`} className={`flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[11px] ${section === id ? "bg-magenta text-white" : "text-white/80 hover:bg-white/10"}`}><Icon size={17}/>{label}{navCount(id) ? <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-magenta">{Math.min(navCount(id), 99)}</span> : null}</Link>)}</nav>
      <div className="mt-3 flex-none space-y-2"><Link href="/contact" className="block rounded-[10px] border border-white/20 p-3 text-xs">Need help?<br/><span className="text-white/60">Contact support</span></Link>{acceptance ? null : <RoleLogoutButton scope="admin" className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm text-white/85 hover:bg-white/10"/>}</div>
    </aside>
    <main className="min-w-0 px-4 pb-24 pt-5 sm:px-6 lg:col-start-2 lg:px-8 lg:pb-8">
      <header className="mb-5 flex items-center justify-between lg:justify-end"><DashboardMobileMenu ariaLabel="platform admin navigation" items={visibleNavigation.map(([id, label, Icon]) => ({ id, label, icon: Icon, href: id === "overview" ? "/admin" : `/admin/${id}`, active: section === id, count: navCount(id) }))}/><b className="font-serif text-xl text-plum lg:hidden">Girlz Culture</b><div className="flex items-center gap-2">{acceptance ? <span className="rounded-full bg-blush px-3 py-1 text-[10px] font-bold text-plum">Acceptance fixture</span> : <><DashboardNotificationCenter scope="admin" onCounts={handleNotificationCounts}/><RoleLogoutButton scope="admin" compact className="flex h-10 w-10 items-center justify-center rounded-full text-plum hover:bg-blush lg:hidden"/></>}</div></header>
      {children}
    </main>
    <nav className="gc-brand-header fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-plum/10 p-2 lg:hidden">{mobileNavigation.map(([id, label, Icon]) => <Link key={id} href={id === "overview" ? "/admin" : `/admin/${id}`} className={`relative flex min-w-14 flex-col items-center gap-1 text-[9px] ${section === id ? "text-magenta" : ""}`}><Icon size={19}/>{label}{navCount(id) ? <span className="absolute right-1 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-magenta px-1 text-[8px] text-white">{Math.min(navCount(id), 99)}</span> : null}</Link>)}</nav>
  </div>;
}

function AdminSectionView({ section, recordId, returnTo, data, overviewMetrics, selected, setSelected, decide, update, onCreated, onTicketRead }: { section: AdminSection; recordId?: string; returnTo?: string; data: DataState; overviewMetrics: OverviewMetrics | null; selected: Row | null; setSelected: (row: Row) => void; decide: (id: string, decision: "approve" | "reject" | "activate") => void; update: (table: string, id: string, changes: Row) => Promise<void>; onCreated: () => Promise<void>; onTicketRead: (mode: "support" | "complaints") => void }) {
  // Missing API arrays are normalized here as a final render guard. Every
  // section can now show its existing empty state instead of crashing.
  const safeData: DataState = {
    salons: rows(data?.salons), applications: rows(data?.applications), customers: rows(data?.customers),
    bookings: rows(data?.bookings), reviews: rows(data?.reviews), tickets: rows(data?.tickets),
    subscriptions: rows(data?.subscriptions), complaints: rows(data?.complaints), admins: rows(data?.admins),
    promotions: rows(data?.promotions), posts: rows(data?.posts), settings: rows(data?.settings), billingEvents: rows(data?.billingEvents), identityConflicts: rows(data?.identityConflicts), changeRequests: rows(data?.changeRequests), reviewEvents: rows(data?.reviewEvents), reviewModerationEvents: rows(data?.reviewModerationEvents), reviewContentQueue: rows(data?.reviewContentQueue), reviewReplyQueue: rows(data?.reviewReplyQueue),
    favorites: rows(data?.favorites), bookingAudits: rows(data?.bookingAudits), adminSecurityEvents: rows(data?.adminSecurityEvents), qualityMetrics: rows(data?.qualityMetrics),
  };
  if (section === "content") return <AdminContentManager initialRecordId={recordId}/>;
  if (recordId) return <AdminRecordWorkspace section={section} recordId={recordId} returnTo={returnTo || `/admin/${section}`} data={safeData} onRefresh={onCreated} onRead={onTicketRead}/>;
  const props = { ...safeData, selected, setSelected, decide, update, onCreated };
  switch (section) {
    case "overview": return <Overview {...props} metrics={overviewMetrics} />;
    case "submissions": return <Submissions {...props} />;
    case "salons": return <AdminSalonsManager />;
    case "customers": return <Customers {...props} />;
    case "bookings": return <Bookings {...props} />;
    case "quality": return <Quality {...props} />;
    case "reviews": return <ReviewsLanding {...props} />;
    case "finance": return <AdminFinanceDashboard />;
    case "marketing": return <Marketing {...props} />;
    case "support": return <div className="space-y-5"><AdminSupportInbox initialTickets={safeData.tickets} initialAssignees={safeData.admins} mode="support" /><Panel title="Booking messages"><p className="text-sm leading-6 text-ink/65">Booking conversations remain attached to their booking record so customer support does not have to manage a second full inbox on this landing page.</p><Link href="/admin/bookings" className="mt-4 inline-flex rounded-lg border border-magenta px-4 py-2 text-xs font-bold text-magenta">Open booking queue</Link></Panel></div>;
    case "complaints": return <AdminSupportInbox initialTickets={safeData.tickets} initialComplaints={safeData.complaints} initialAssignees={safeData.admins} mode="complaints" />;
    case "subscriptions": return <Subscriptions {...props} />;
    case "engine": return <AdminEngineLanding />;
    default: return <SettingsTeam {...props} />;
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <article className="rounded-[14px] border border-plum/10 bg-white/75 p-4"><p className="text-[10px] font-semibold text-ink/60">{label}</p><b className="mt-2 block font-serif text-2xl text-ink">{value}</b></article>;
}

function AdminDataBoundaryNotice({ meta }: { meta: AdminDataMeta }) {
  const bounded = Object.entries(meta.source_limits || {}).filter(([, value]) => value?.has_more);
  if (!bounded.length) return null;
  const labels = bounded.map(([table, value]) => `${table.replaceAll("_", " ")} (${Number(value.limit || 500)} newest)`).join(", ");
  return <div role="status" className="mb-5 rounded-xl border border-amber/40 bg-amber/10 p-4 text-xs leading-5 text-ink/70"><b className="text-plum">Bounded administrative view</b><p className="mt-1">This landing reached its explicit record-safety boundary for {labels}. Totals shown here cover the loaded records and are not presented as complete platform totals. Use the section&apos;s focused ledger/export or narrow the operational time range where available.</p></div>;
}

function Overview(p: DataState & { metrics: OverviewMetrics | null }) {
  const activeSalons = p.salons.filter((salon) => String(salon.status).toLowerCase() === "active").length;
  const completedRevenue = p.bookings.filter((booking) => String(booking.status).toLowerCase() === "completed").reduce((sum, booking) => sum + Number(booking.estimated_total || 0), 0);
  const deposits = p.bookings.filter(isPaidDeposit).reduce((sum, booking) => sum + Number(booking.deposit_amount || 0), 0);
  const activity = recentActivity(p);
  const bookingSeries = dailySeries(p.bookings, "appointment_datetime", () => 1);
  const revenueSeries = dailySeries(p.bookings.filter((booking) => String(booking.status).toLowerCase() === "completed"), "appointment_datetime", (booking) => Number(booking.estimated_total || 0));
  const metrics = p.metrics || {
    total_salons: p.salons.length,
    active_salons: activeSalons,
    pending_submissions: p.applications.filter((item) => item.status === "Pending").length,
    total_customers: p.customers.length,
    total_bookings: p.bookings.length,
    completed_booking_value: completedRevenue,
    deposits_collected: deposits,
  };
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Total Salons", metrics.total_salons], ["Active Salons", metrics.active_salons], ["Pending Submissions", metrics.pending_submissions], ["Total Customers", metrics.total_customers], ["Total Bookings", metrics.total_bookings], ["Completed Booking Value", money(metrics.completed_booking_value)], ["Deposits Collected", money(metrics.deposits_collected)]].map(([label, value]) => <Stat key={label as string} label={label as string} value={value as string | number} />)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr_1fr]"><Panel title="Recent Activity">{activity.length ? activity.map((item) => <Line key={item.key} label={item.label} meta={dateTime(item.at)} />) : <EmptyState title="No activity yet" body="Applications, bookings, reviews, and registrations will appear here." />}</Panel><Panel title="Alerts"><Line label={`${metrics.pending_submissions} pending submissions`} meta="Require review" /><Line label={`${p.reviews.filter((review) => review.dispute_status && review.dispute_status !== "None").length} disputed reviews`} meta="Need attention" /><Line label={`${p.salons.filter((salon) => Number(salon.review_count || 0) > 0 && Number(salon.rating_overall) < 3.5).length} salons below threshold`} meta="Based on reviews" /></Panel><Panel title="Quick Actions"><div className="grid grid-cols-2 gap-3"><QuickLink href="/admin/submissions" label="Review submissions" /><QuickLink href="/admin/salons" label="Manage salons" /><QuickLink href="/admin/content/blog-new" label="Create blog post" /><QuickLink href="/admin/quality" label="View reports" /></div></Panel></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><DataChart title="Bookings Overview" values={bookingSeries} empty="No booking activity yet." /><DataChart title="Completed Booking Value" values={revenueSeries} empty="Completed bookings will create this report." moneyValues /></div></>;
}

// Retained temporarily for rollback comparison while the focused submission
// route completes authenticated preview acceptance.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacySubmissions(p: any) {
  const states = [...new Set(p.applications.map((item: Row) => item.state || "State not provided"))] as string[];
  const [state, setState] = useState(states[0] || "");
  const selectedState = states.includes(state) ? state : states[0] || "";
  const rows = p.applications.filter((item: Row) => (item.state || "State not provided") === selectedState);
  if (!p.applications.length) return <EmptyState title="No salon submissions yet" body="New salon applications will be grouped by state here." />;
  return <div className="grid min-w-0 gap-5 xl:grid-cols-[1.2fr_.8fr]">
    <section className="min-w-0 rounded-[14px] border border-plum/10 bg-white p-4">
      <div className="flex gap-2 overflow-x-auto border-b border-plum/10 pb-3">{states.map((item) => <button key={item} onClick={() => setState(item)} className={`shrink-0 rounded-full px-4 py-2 text-xs ${selectedState === item ? "bg-magenta text-white" : "bg-blush/30"}`}>{item} <b>{p.applications.filter((application: Row) => (application.state || "State not provided") === item).length}</b></button>)}</div>
      <DataTable headers={["Business Name", "Owner / Contact", "Submitted", "Status", "Review"]}>{rows.map((application: Row) => <tr key={application.id} onClick={() => p.setSelected(application)} className="border-b border-plum/10 hover:bg-blush/20">
        <Td>{application.business_name}</Td><Td>{application.owner_name}</Td><Td>{date(application.submitted_at)}</Td>
        <Td><Badge value={application.status} />{application.status === "Offboarded" && application.approval_status ? <span className="mt-1 block text-[9px] text-ink/50">Application history: {application.approval_status}</span> : null}</Td>
        <Td><div className="flex flex-col items-start gap-2"><Link href={`/admin/submissions/${application.id}`} onClick={(event) => event.stopPropagation()} className="font-bold text-magenta">Full details</Link>{application.status === "Offboarded" ? <Link href="/admin/engine?category=data_management" onClick={(event) => event.stopPropagation()} className="text-[10px] font-bold text-red-700">Archive / delete test record</Link> : null}</div></Td>
      </tr>)}</DataTable>
    </section>
    <ApplicationDetails application={p.selected} decide={p.decide} />
  </div>;
}

function ApplicationDetails({ application, decide }: { application: Row | null; decide: (id: string, decision: "approve" | "reject" | "activate") => void }) {
  return <Panel title={application?.business_name || "Application details"}>{application ? <div className="space-y-4 text-sm"><Badge value={application.status} />{[["Owner", application.owner_name], ["Email", application.business_email], ["Phone", application.phone], ["Location", [application.city, application.state].filter(Boolean).join(", ")], ["Type", application.business_type || "Not provided"], ["Years operating", application.years_in_operation], ["Stylists", application.stylist_count], ["Plan", application.selected_plan]].map(([label, value]) => <div key={label}><b>{label}</b><p className="text-ink/60">{value || "Not provided"}</p></div>)}{application.logo_url ? <img src={application.logo_url} alt="Salon logo" className="h-20 w-20 rounded-lg object-cover" /> : null}{application.photo_urls?.length ? <div><b>Photos</b><div className="mt-2 grid grid-cols-3 gap-2">{application.photo_urls.map((url: string) => <a href={url} target="_blank" rel="noreferrer" key={url}><img src={url} alt="Application upload" className="h-20 w-full rounded-lg object-cover" /></a>)}</div></div> : null}{application.document_urls?.length ? <div><b>Documents</b>{application.document_urls.map((url: string, index: number) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1 block text-magenta">Open document {index + 1}</a>)}</div> : null}<Link href={`/admin/submissions/${application.id}`} className="block rounded-lg border border-plum/15 py-3 text-center font-bold text-magenta">Open full application & pilot controls</Link><div className="grid grid-cols-2 gap-3">{application.status === "Pending" ? <><button onClick={() => decide(application.id, "approve")} className="rounded-lg bg-magenta py-3 font-bold text-white">Approve</button><button onClick={() => decide(application.id, "reject")} className="rounded-lg border border-magenta py-3 font-bold text-magenta">Reject</button></> : application.status === "Approved" ? <button onClick={() => decide(application.id, "activate")} className="col-span-2 rounded-lg bg-plum px-3 py-3 font-bold text-white">Recheck gates & publish if ready</button> : null}</div></div> : <p>Select an application.</p>}</Panel>;
}

function Submissions(p: any) {
  const { query, setQuery, status, setStatus } = useAdminListContext();
  const [state, setState] = useAdminQueryParam("state", "all");
  const [view, setView] = useAdminQueryParam("view", "current");
  const states = [...new Set<string>(p.applications.map((item: Row) => String(item.state || "State not provided")))].sort();
  const term = query.trim().toLowerCase();
  const archived = (application: Row) => /archived|offboarded|deleted/i.test(String(application.status || ""));
  const visible = p.applications.filter((application: Row) => {
    const matchesQuery = !term || [application.business_name, application.owner_name, application.business_email, application.city, application.state].some((value) => String(value || "").toLowerCase().includes(term));
    const matchesState = state === "all" || String(application.state || "State not provided") === state;
    const matchesStatus = status === "all" || String(application.status || "Pending").toLowerCase() === status;
    return matchesQuery && matchesState && matchesStatus && (view === "archived" ? archived(application) : !archived(application));
  });
  const returnPath = `/admin/submissions?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(status !== "all" ? { status } : {}), ...(state !== "all" ? { state } : {}), ...(view !== "current" ? { view } : {}) })}`.replace(/\?$/, "");
  return <div data-admin-record-landing className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><Stat label="Current submissions" value={p.applications.filter((item: Row) => !archived(item)).length}/><Stat label="Pending review" value={p.applications.filter((item: Row) => String(item.status).toLowerCase() === "pending").length}/><Stat label="Archived / offboarded" value={p.applications.filter(archived).length}/></div>
    <section className="rounded-[14px] border border-plum/10 bg-white p-4"><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_180px]"><label className="flex min-h-11 items-center gap-2 rounded-lg border border-plum/15 px-3 text-xs"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search business, owner, email, or market" className="min-w-0 flex-1 outline-none"/></label><select aria-label="State" value={state} onChange={(event) => setState(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All states</option>{states.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Submission status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All statuses</option>{[...new Set<string>(p.applications.map((item: Row) => String(item.status || "Pending")))].sort().map((item) => <option key={item} value={item.toLowerCase()}>{item}</option>)}</select><select aria-label="Submission view" value={view} onChange={(event) => setView(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="current">Current</option><option value="archived">Archived / offboarded</option></select></div>
      <p className="mt-3 text-xs text-ink/50">{visible.length} submission{visible.length === 1 ? "" : "s"} in this view</p>
      <div className="mt-4 space-y-3 md:hidden">{visible.map((application: Row) => <Link key={application.id} href={`/admin/submissions/${application.id}?return=${encodeURIComponent(returnPath)}`} className="block rounded-xl border border-plum/10 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg text-plum">{application.business_name}</h3><p className="mt-1 text-xs text-ink/55">{application.owner_name} · {application.state || "State not provided"}</p></div><Badge value={application.status}/></div><p className="mt-3 text-xs text-ink/55">Submitted {date(application.submitted_at)}</p><span className="mt-3 inline-flex text-xs font-bold text-magenta">Open complete application →</span></Link>)}{!visible.length ? <EmptyState title="No submissions found" body="No applications match the current search, state, status, and archive filters."/> : null}</div>
      <div className="mt-4 hidden md:block"><DataTable headers={["Business Name", "Owner / Contact", "State / Market", "Submitted", "Status", "Review"]}>{visible.length ? visible.map((application: Row) => <tr key={application.id} className="border-b border-plum/10"><Td>{application.business_name}</Td><Td>{application.owner_name}<span className="mt-1 block text-[10px] text-ink/45">{application.business_email}</span></Td><Td>{application.state || "State not provided"}<span className="mt-1 block text-[10px] text-ink/45">{application.city || "Market not provided"}</span></Td><Td>{date(application.submitted_at)}</Td><Td><Badge value={application.status}/></Td><Td><Link href={`/admin/submissions/${application.id}?return=${encodeURIComponent(returnPath)}`} className="font-bold text-magenta">Open details</Link></Td></tr>) : <EmptyTable columns={6} text="No submissions match this view."/>}</DataTable></div>
    </section>
  </div>;
}

function Customers(p: any) {
  const { query, setQuery, status, setStatus } = useAdminListContext();
  const term = query.trim().toLowerCase();
  const visible = p.customers.filter((customer: Row) => (!term || [customer.name, customer.email].some((value) => String(value || "").toLowerCase().includes(term))) && (status === "all" || String(customer.status || "Active").toLowerCase() === status));
  const returnPath = `/admin/customers?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(status !== "all" ? { status } : {}) })}`.replace(/\?$/, "");
  return <Panel title="Customer accounts"><div data-admin-record-landing><div className="mb-4 flex flex-wrap gap-2"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-plum/15 bg-white px-3 text-xs sm:min-w-72"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer name or email" className="min-w-0 flex-1 outline-none"/></label><select aria-label="Customer status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.length ? visible.map((customer: Row) => { const count = p.bookings.filter((booking: Row) => booking.customer_id === customer.id || String(booking.guest_email || "").toLowerCase() === String(customer.email || "").toLowerCase()).length; return <Link key={customer.id} href={`/admin/customers/${customer.id}?return=${encodeURIComponent(returnPath)}`} className="rounded-xl border border-plum/10 p-4 transition hover:border-magenta hover:bg-blush/20"><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg text-plum">{customer.name || "Customer"}</h3><p className="mt-1 break-all text-xs text-ink/55">{customer.email}</p></div><Badge value={customer.status || "Active"}/></div><div className="mt-4 flex items-center justify-between text-xs"><span>Joined {date(customer.created_at)}</span><b>{count} booking{count === 1 ? "" : "s"}</b></div><span className="mt-3 inline-flex text-xs font-bold text-magenta">Open customer record →</span></Link>; }) : <div className="col-span-full"><EmptyState title="No customer accounts" body={term ? "No customers match the current search and status filters." : "Customer accounts will appear here after registration or booking."}/></div>}</div></div></Panel>;
}

function Bookings(p: any) {
  const { query, setQuery, status, setStatus } = useAdminListContext();
  const [fromDate, setFromDate] = useAdminQueryParam("from", "");
  const [toDate, setToDate] = useAdminQueryParam("to", "");
  const [salonFilter, setSalonFilter] = useAdminQueryParam("salon", "all");
  const [paymentFilter, setPaymentFilter] = useAdminQueryParam("payment", "all");
  const normalizedQuery=query.trim().toLowerCase();
  const visible=p.bookings.filter((booking:Row)=>{
    const matchesQuery = !normalizedQuery || [
      booking.public_reference,
      booking.confirmation_code,
      booking.id,
      booking.guest_name,
      booking.guest_email,
    ].some((value)=>String(value||"").toLowerCase().includes(normalizedQuery));
    const appointmentDate = String(booking.appointment_datetime || "").slice(0, 10);
    const paymentState = String(booking.payment_status || booking.deposit_status || booking.financial_status || (Number(booking.deposit_amount || 0) > 0 ? "deposit paid" : "unpaid")).toLowerCase();
    return matchesQuery &&
      (status === "all" || String(booking.status || "Pending").toLowerCase() === status) &&
      (salonFilter === "all" || String(booking.salon_id) === salonFilter) &&
      (paymentFilter === "all" || paymentState === paymentFilter) &&
      (!fromDate || appointmentDate >= fromDate) &&
      (!toDate || appointmentDate <= toDate);
  });
  const bookingStatuses = [...new Set<string>(p.bookings.map((booking: Row) => String(booking.status || "Pending")))].sort();
  const paymentStates = [...new Set<string>(p.bookings.map((booking: Row) => String(booking.payment_status || booking.deposit_status || booking.financial_status || (Number(booking.deposit_amount || 0) > 0 ? "deposit paid" : "unpaid")).toLowerCase()))].filter(Boolean).sort();
  const returnPath = `/admin/bookings?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(status !== "all" ? { status } : {}), ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}), ...(salonFilter !== "all" ? { salon: salonFilter } : {}), ...(paymentFilter !== "all" ? { payment: paymentFilter } : {}) })}`.replace(/\?$/, "");
  return <><div className="mb-4 flex flex-wrap justify-between gap-3"><div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_150px_170px_160px_145px_145px]"><label className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-plum/15 bg-white px-3 text-xs"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search reference, UUID, or customer" className="min-w-0 flex-1 outline-none"/></label><select aria-label="Booking status" value={status} onChange={(event)=>setStatus(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All statuses</option>{bookingStatuses.map((value) => <option key={value} value={value.toLowerCase()}>{value}</option>)}</select><select aria-label="Salon" value={salonFilter} onChange={(event)=>setSalonFilter(event.target.value)} className="min-h-11 min-w-0 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All salons</option>{p.salons.map((salon: Row)=><option key={salon.id} value={String(salon.id)}>{salon.name || "Salon"}</option>)}</select><select aria-label="Payment state" value={paymentFilter} onChange={(event)=>setPaymentFilter(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All payment states</option>{paymentStates.map((value)=><option key={value}>{value}</option>)}</select><input aria-label="Appointments from" type="date" value={fromDate} onChange={(event)=>setFromDate(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"/><input aria-label="Appointments through" type="date" value={toDate} onChange={(event)=>setToDate(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"/></div><Link href={`/admin/bookings/new?return=${encodeURIComponent(returnPath)}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-magenta px-5 text-sm font-bold text-white">Create booking manually</Link></div><Panel title="Booking queue"><div data-admin-record-landing><p className="mb-3 text-xs text-ink/50">{visible.length} matching booking{visible.length === 1 ? "" : "s"}</p><div className="grid gap-3 lg:grid-cols-2">{visible.length ? visible.map((booking: Row) => { const salon = p.salons.find((row: Row) => row.id === booking.salon_id); return <Link key={booking.id} href={`/admin/bookings/${booking.id}?return=${encodeURIComponent(returnPath)}`} className="rounded-xl border border-plum/10 p-4 transition hover:border-magenta hover:bg-blush/20"><div className="flex flex-wrap items-start justify-between gap-2"><div><b className="text-sm text-plum">{bookingReference(booking)}</b><p className="mt-1 text-xs text-ink/55">{salon?.name || "Salon unavailable"} · {booking.guest_name || "Customer"}</p></div><Badge value={booking.status}/></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink/65"><span>{dateTime(booking.appointment_datetime, salon?.time_zone)}</span><span className="text-right">Deposit {money(Number(booking.deposit_amount || 0))}</span></div><span className="mt-3 inline-flex text-xs font-bold text-magenta">Open booking record →</span></Link>; }) : <div className="col-span-full"><EmptyState title="No bookings found" body="No bookings match the current search, salon, date, payment, and status filters."/></div>}</div></div></Panel></>;
}

function Quality(p: any) {
  const [stateFilter, setStateFilter] = useAdminQueryParam("state", "all");
  const [marketFilter, setMarketFilter] = useAdminQueryParam("market", "all");
  const [marketplaceStatus, setMarketplaceStatus] = useAdminQueryParam("status", "all");
  const states = [...new Set<string>(p.salons.map((salon: Row) => String(salon.state || "")).filter(Boolean))].sort();
  const markets = [...new Set<string>(p.salons.filter((salon: Row) => stateFilter === "all" || String(salon.state || "") === stateFilter).map((salon: Row) => String(salon.city || salon.neighborhood || "")).filter(Boolean))].sort();
  const filteredSalons = p.salons.filter((salon: Row) =>
    (stateFilter === "all" || String(salon.state || "") === stateFilter) &&
    (marketFilter === "all" || String(salon.city || salon.neighborhood || "") === marketFilter) &&
    (marketplaceStatus === "all" || String(salon.status || "").toLowerCase() === marketplaceStatus),
  );
  const returnPath = `/admin/quality?${new URLSearchParams({ ...(stateFilter !== "all" ? { state: stateFilter } : {}), ...(marketFilter !== "all" ? { market: marketFilter } : {}), ...(marketplaceStatus !== "all" ? { status: marketplaceStatus } : {}) })}`.replace(/\?$/, "");
  const rated = filteredSalons.filter((salon: Row) => Number(salon.review_count || 0) > 0);
  const average = rated.length ? rated.reduce((sum: number, salon: Row) => sum + Number(salon.rating_overall || 0), 0) / rated.length : 0;
  const visibleReviews = p.reviews.filter((review: Row) => review.moderation_status === "Published" && review.dispute_status !== "Removed");
  const lateness = visibleReviews.filter((review: Row) => /late|wait|delay/i.test(review.written_review || ""));
  const qualitySeries = dailySeries(visibleReviews, "created_at", (review) => Number(review.rating_overall || 0));
  const setting=p.settings.find((item:Row)=>item.key==="quality_thresholds");
  const storedThreshold=Number(setting?.value?.salon_cancellation_rate_percent||10);
  const [threshold,setThreshold]=useState<number|"">(storedThreshold);
  const effectiveThreshold=threshold===""?storedThreshold:threshold;
  const metricBySalon=new Map(p.qualityMetrics.map((metric:Row)=>[String(metric.salon_id),metric]));
  const metrics=filteredSalons.map((salon:Row)=>{
    const metric=metricBySalon.get(String(salon.id)) as Row | undefined;
    const totalBookings=Number(metric?.total_bookings||0);
    const salonCancellations=Number(metric?.salon_cancellations||0);
    const cancellationRate=totalBookings?Number(metric?.cancellation_rate_percent||0):0;
    const onTimeRate=Number(metric?.on_time_measured||0)>0?Number(metric?.on_time_rate_percent||0):null;
    const activeComplaints=Number(metric?.active_complaints||0);
    const qualityScore=metric?.composite_quality_score==null?null:Number(metric.composite_quality_score);
    return {...salon,totalBookings,completedBookings:Number(metric?.completed_bookings||0),salonCancellations,cancellationRate,onTimeRate,activeComplaints,qualityScore,flagged:totalBookings>0&&cancellationRate>effectiveThreshold};
  });
  const ranked=[...metrics].filter((salon:Row)=>salon.qualityScore!==null).sort((left:Row,right:Row)=>Number(right.qualityScore)-Number(left.qualityScore));
  const flagged=metrics.filter((salon:Row)=>salon.flagged);
  async function saveThreshold(){if(threshold===""||threshold<1||threshold>100)return;await p.update("admin_settings","quality_thresholds",{value:{...(setting?.value||{}),salon_cancellation_rate_percent:threshold}})}
  return <div data-admin-record-landing><div className="mb-4 grid gap-2 rounded-xl border border-plum/10 bg-white p-4 sm:grid-cols-3"><select aria-label="Quality state" value={stateFilter} onChange={(event)=>{ setStateFilter(event.target.value); setMarketFilter("all"); }} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All states</option>{states.map((value)=><option key={value}>{value}</option>)}</select><select aria-label="Quality market" value={marketFilter} onChange={(event)=>setMarketFilter(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All markets</option>{markets.map((value)=><option key={value}>{value}</option>)}</select><select aria-label="Marketplace status" value={marketplaceStatus} onChange={(event)=>setMarketplaceStatus(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All marketplace states</option>{[...new Set<string>(p.salons.map((salon: Row)=>String(salon.status || "").toLowerCase()).filter(Boolean))].sort().map((value)=><option key={value}>{value}</option>)}</select><p className="sm:col-span-3 text-xs text-ink/50">Showing exact 365-day terminal-outcome metrics for {filteredSalons.length} salon{filteredSalons.length === 1 ? "" : "s"}. Filters remain in place after opening a salon record.</p></div><div className="grid gap-4 sm:grid-cols-4"><Stat label="Filtered Average Rating" value={average.toFixed(1)} /><Stat label="Cancellation Flags" value={flagged.length} /><Stat label="Active Verified Complaints" value={metrics.reduce((sum:number,item:Row)=>sum+Number(item.activeComplaints||0),0)} /><Stat label="Published Reviews" value={metrics.reduce((sum:number,item:Row)=>sum+Number(item.review_count||0),0)} /></div><div className="mt-5 grid gap-5 lg:grid-cols-3"><Panel title="Best-Performing Partners">{ranked.length ? ranked.slice(0, 5).map((salon: Row) => <RecordLine key={salon.id} href={`/admin/quality/${salon.id}?return=${encodeURIComponent(returnPath)}`} label={salon.name} meta={`Quality ${Number(salon.qualityScore).toFixed(1)} · cancellations ${Number(salon.cancellationRate).toFixed(1)}%`} />) : <EmptyState title="No quality data" body="Composite scores begin after terminal bookings or verified reviews are recorded." />}</Panel><Panel title="Salons Needing Attention">{flagged.length?flagged.map((salon:Row)=><RecordLine key={salon.id} href={`/admin/quality/${salon.id}?return=${encodeURIComponent(returnPath)}`} label={salon.name} meta={`${Number(salon.cancellationRate).toFixed(1)}% salon cancellations (${salon.salonCancellations}/${salon.totalBookings} terminal outcomes)`}/>):<EmptyState title="No cancellation flags" body={`No salon exceeds the current ${effectiveThreshold}% threshold.`}/>}</Panel><Panel title="Quality Threshold"><p className="text-xs leading-5 text-ink/60">Auto-flag salons when salon-initiated cancellations exceed this percentage of completed and cancelled appointments in the last 365 days.</p><div className="mt-4 flex items-end gap-2"><label className="flex-1 text-[10px] font-bold">Cancellation rate %<NumericInput min={1} max={100} decimalPlaces={2} value={threshold} onValueChange={(value)=>setThreshold(value===""?"":Number(value))} className="mt-1 min-h-10 w-full rounded-lg border px-3"/></label><button disabled={threshold===""||threshold<1||threshold>100} onClick={()=>void saveThreshold()} className="min-h-10 rounded-lg bg-magenta px-4 text-xs font-bold text-white disabled:opacity-40">Save</button></div><Line label="Lateness or long waits" meta={`${lateness.length} loaded reviews`} /><Line label="On-time performance" meta={metrics.some((salon:Row)=>salon.onTimeRate!==null)?"Measured from completed services with recorded starts":"Not measured yet"}/></Panel></div><div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><DataChart title="Loaded Review Rating Activity" values={qualitySeries} empty="No review activity yet." /><Panel title="Cancellation Monitoring">{metrics.filter((salon:Row)=>salon.totalBookings>0).sort((a:Row,b:Row)=>Number(b.cancellationRate)-Number(a.cancellationRate)).slice(0,8).map((salon:Row)=><RecordLine key={salon.id} href={`/admin/quality/${salon.id}?return=${encodeURIComponent(returnPath)}`} label={salon.name} meta={`${Number(salon.cancellationRate).toFixed(1)}% · ${salon.salonCancellations} salon cancellations`}/>)}</Panel></div></div>;
}

function ReviewsLanding(p: any) {
  const { query, setQuery, status, setStatus } = useAdminListContext();
  const term = query.trim().toLowerCase();
  const statusFor = (review: Row) => review.dispute_status === "Disputed" || review.moderation_status === "Under review" ? "disputed" : review.moderation_status === "Hidden" || review.dispute_status === "Removed" ? "hidden" : p.reviewContentQueue.some((row: Row) => row.review_id === review.id && row.status === "Pending") || p.reviewReplyQueue.some((row: Row) => row.review_id === review.id && row.status === "Pending") ? "pending" : "published";
  const visible = p.reviews.filter((review: Row) => {
    const salon = p.salons.find((item: Row) => item.id === review.salon_id);
    const matchesQuery = !term || [review.display_name, review.written_review, salon?.name, review.id].some((value) => String(value || "").toLowerCase().includes(term));
    return matchesQuery && (status === "all" || statusFor(review) === status);
  });
  const counts = { published: p.reviews.filter((row: Row) => statusFor(row) === "published").length, pending: p.reviews.filter((row: Row) => statusFor(row) === "pending").length, disputed: p.reviews.filter((row: Row) => statusFor(row) === "disputed").length, hidden: p.reviews.filter((row: Row) => statusFor(row) === "hidden").length };
  const returnPath = `/admin/reviews?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(status !== "all" ? { status } : {}) })}`.replace(/\?$/, "");
  return <div data-admin-record-landing className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Published", counts.published],["Pending moderation", counts.pending],["Disputed", counts.disputed],["Hidden / removed", counts.hidden]].map(([label,value]) => <Stat key={String(label)} label={String(label)} value={value}/>)}</div><Panel title="Reviews & Moderation"><div className="mb-4 flex flex-wrap gap-2"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-plum/15 bg-white px-3 text-xs sm:min-w-72"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reviewer, salon, text, or review ID" className="min-w-0 flex-1 outline-none"/></label><select aria-label="Moderation status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All review states</option><option value="published">Published</option><option value="pending">Pending moderation</option><option value="disputed">Disputed</option><option value="hidden">Hidden / removed</option></select></div><div className="grid gap-3 lg:grid-cols-2">{visible.length ? visible.map((review: Row) => { const salon = p.salons.find((item: Row) => item.id === review.salon_id); const recordStatus = statusFor(review); return <Link key={review.id} href={`/admin/reviews/${review.id}?return=${encodeURIComponent(returnPath)}`} className={`rounded-xl border p-4 transition hover:border-magenta ${recordStatus === "disputed" ? "border-red-200 bg-red-50/50" : "border-plum/10 bg-white hover:bg-blush/20"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><b className="text-plum">{review.display_name || "Verified client"}</b><Badge value={recordStatus}/></div><p className="mt-1 text-xs text-ink/55">{salon?.name || "Salon unavailable"} · {date(review.created_at)}</p></div><span className="inline-flex items-center gap-1 font-bold text-amber"><Star size={15} fill="currentColor"/>{Number(review.rating_overall || 0).toFixed(1)}</span></div><p className="mt-3 line-clamp-2 text-sm leading-6">{review.written_review || "Rating only; no written review."}</p><span className="mt-3 inline-flex text-xs font-bold text-magenta">Open evidence and moderation →</span></Link>; }) : <div className="col-span-full"><EmptyState title="No reviews found" body="No review records match the current search and moderation filters."/></div>}</div></Panel></div>;
}

// Retained temporarily for rollback comparison while the focused moderation
// workspace completes authenticated browser acceptance.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Reviews(p: any) {
  const [activeReview, setActiveReview] = useState<string | null>(null);
  const [action, setAction] = useState<"hidden" | "restored" | "resolved" | "approve_content" | "reject_content" | "approve_reply" | "reject_reply">("resolved");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function moderate(reviewId: string) {
    if (reason.trim().length < 10) {
      setFeedback("Enter a moderation reason of at least 10 characters.");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}/moderate`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const body = await readApiResponse(
        response,
        "The review moderation action could not be completed.",
      );
      if (!response.ok) throw new Error(body.error || "The review moderation action could not be completed.");
      await p.onCreated();
      setActiveReview(null);
      setReason("");
      setFeedback("Moderation saved with an audit record.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The review moderation action could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Reviews & Moderation">
      {feedback ? <p role="status" className="mb-4 rounded-lg bg-blush/50 p-3 text-xs text-plum">{feedback}</p> : null}
      <div className="space-y-4">
        {p.reviews.length ? p.reviews.map((review: Row) => {
          const salon = p.salons.find((item: Row) => item.id === review.salon_id);
          const booking = p.bookings.find((item: Row) => item.id === review.booking_id);
          const events = [
            ...p.reviewEvents
              .filter((item: Row) => item.review_id === review.id)
              .map((item: Row) => ({ ...item, audit_source: "Dispute evidence" })),
            ...p.reviewModerationEvents
              .filter((item: Row) => item.review_id === review.id)
              .map((item: Row) => ({ ...item, audit_source: "Moderation event" })),
          ].sort((left: Row, right: Row) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
          const contentQueue = p.reviewContentQueue.find((item: Row) => item.review_id === review.id);
          const replyQueue = p.reviewReplyQueue.find((item: Row) => item.review_id === review.id);
          const disputed = review.dispute_status === "Disputed" || review.moderation_status === "Under review";
          return (
            <article key={review.id} className={`rounded-xl border p-4 ${disputed ? "border-red-200 bg-red-50/60" : "border-plum/10 bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{review.display_name || "Verified Client"}</b>
                    <span className="rounded-full bg-plum px-2 py-0.5 text-[9px] font-bold text-white">Verified booking</span>
                    <Badge value={review.moderation_status || "Published"} />
                    {review.dispute_status && review.dispute_status !== "None" ? <Badge value={review.dispute_status} /> : null}
                  </div>
                  <p className="mt-1 text-xs text-ink/60">{salon?.name || "Salon unavailable"} · {date(review.created_at)}</p>
                </div>
                <span className="inline-flex items-center gap-1 font-bold text-amber"><Star size={15} fill="currentColor" />{Number(review.rating_overall || 0).toFixed(1)}</span>
              </div>
              <p className="mt-3 text-sm leading-6">{review.written_review || "No written review"}</p>
              {contentQueue ? <div className={`mt-3 rounded-lg border p-3 text-xs ${contentQueue.status === "Pending" ? "border-amber-300 bg-amber-50" : "border-plum/10 bg-cream"}`}><div className="flex flex-wrap items-center justify-between gap-2"><b>Written content moderation</b><Badge value={contentQueue.status} /></div><p className="mt-2"><b>Submitted name:</b> {contentQueue.submitted_display_name}</p>{contentQueue.submitted_review_title ? <p className="mt-1"><b>Submitted title:</b> {contentQueue.submitted_review_title}</p> : null}{contentQueue.submitted_written_review ? <p className="mt-1 whitespace-pre-wrap"><b>Submitted review:</b> {contentQueue.submitted_written_review}</p> : <p className="mt-1 text-ink/55">Rating only; no written review was submitted.</p>}{contentQueue.detection_reason ? <p className="mt-2 text-ink/55">Queued by contextual moderation: {contentQueue.detection_reason}</p> : null}</div> : null}
              {replyQueue ? <div className={`mt-3 rounded-lg border p-3 text-xs ${replyQueue.status === "Pending" ? "border-amber-300 bg-amber-50" : "border-plum/10 bg-cream"}`}><div className="flex flex-wrap items-center justify-between gap-2"><b>Salon reply moderation</b><Badge value={replyQueue.status} /></div><p className="mt-2 whitespace-pre-wrap">{replyQueue.submitted_reply}</p>{replyQueue.detection_reason ? <p className="mt-2 text-ink/55">Queued by contextual moderation: {replyQueue.detection_reason}</p> : null}</div> : null}
              <div className="mt-4 grid gap-3 rounded-lg bg-cream p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div><b>Booking evidence</b><p className="mt-1 text-ink/60">{booking ? bookingReference(booking) : "Booking unavailable"}</p></div>
                <div><b>Appointment</b><p className="mt-1 text-ink/60">{booking ? dateTime(booking.appointment_datetime, salon?.time_zone) : "Unavailable"}</p></div>
                <div><b>Booking status</b><p className="mt-1 text-ink/60">{booking?.status || "Unavailable"}</p></div>
                <div><b>Deposit</b><p className="mt-1 text-ink/60">{booking ? `${money(Number(booking.deposit_amount || 0))} · ${booking.deposit_status || "Unknown"}` : "Unavailable"}</p></div>
              </div>
              {review.dispute_reason ? <div className="mt-3 rounded-lg border border-red-200 bg-white p-3 text-xs"><b>Salon dispute reason</b><p className="mt-1 leading-5 text-ink/70">{review.dispute_reason}</p></div> : null}
              {events.length ? (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer font-bold text-plum">Audit history ({events.length})</summary>
                  <div className="mt-2 space-y-2">{events.map((event: Row) => <p key={`${event.audit_source}-${event.id}`} className="border-l-2 border-magenta pl-3"><b>{String(event.action || "").replace(/^./, (value: string) => value.toUpperCase())}</b><span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-ink/55">{event.audit_source}</span>{event.reason ? <span className="mt-1 block text-ink/75">{event.reason}</span> : null}<span className="block text-ink/50">{event.actor_role ? `${String(event.actor_role).replaceAll("_", " ")} · ` : ""}{dateTime(event.created_at)}</span></p>)}</div>
                </details>
              ) : null}
              <div className="mt-4">
                {activeReview === review.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); void moderate(String(review.id)); }} className="rounded-lg border border-magenta/20 bg-blush/30 p-3">
                    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                      <label className="text-xs font-bold">Action<select value={action} onChange={(event) => setAction(event.target.value as typeof action)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal">{contentQueue?.status === "Pending" ? <><option value="approve_content">Approve written content</option><option value="reject_content">Reject written content; keep rating</option></> : null}{replyQueue?.status === "Pending" ? <><option value="approve_reply">Approve salon reply</option><option value="reject_reply">Reject salon reply</option></> : null}<option value="resolved">Resolve and publish</option><option value="hidden">Hide under policy</option><option value="restored">Restore to public</option></select></label>
                      <label className="text-xs font-bold">Published moderation reason<textarea required minLength={10} maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal" placeholder="Explain the policy and evidence used for this decision." /></label>
                    </div>
                    <div className="mt-3 flex gap-2"><button disabled={saving} className="min-h-10 rounded-lg bg-magenta px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save audited decision"}</button><button type="button" onClick={() => { setActiveReview(null); setReason(""); }} className="min-h-10 rounded-lg border border-plum/15 px-4 text-xs">Cancel</button></div>
                  </form>
                ) : <button type="button" onClick={() => { setActiveReview(String(review.id)); setAction(contentQueue?.status === "Pending" ? "approve_content" : replyQueue?.status === "Pending" ? "approve_reply" : disputed ? "resolved" : "hidden"); setReason(""); }} className="min-h-10 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta">Review evidence & moderate</button>}
              </div>
            </article>
          );
        }) : <EmptyState title="No reviews yet" body="Completed-booking reviews will appear here for moderation." />}
      </div>
    </Panel>
  );
}

// Retained temporarily for rollback comparison until the launch Finance
// workspace has completed preview review.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Finance(p: any) {
  const [stateFilter,setStateFilter]=useState("all");
  const [planFilter,setPlanFilter]=useState("all");
  const [typeFilter,setTypeFilter]=useState("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [fromDate,setFromDate]=useState(()=>{const value=new Date();value.setDate(value.getDate()-30);return value.toISOString().slice(0,10)});
  const [toDate,setToDate]=useState(()=>new Date().toISOString().slice(0,10));
  const eventTypes=["New subscription","Upgrade","Upgrade payment failed","Downgrade scheduled","Downgrade became effective","Cancellation scheduled","Subscription ended","Renewal payment","Renewal failed","Refund","Credit","Reactivation"];
  const paymentStatuses=[...new Set(p.billingEvents.map((event:Row)=>String(event.payment_status||"")).filter(Boolean))] as string[];
  const start=fromDate?new Date(`${fromDate}T00:00:00`).getTime():Number.NEGATIVE_INFINITY;
  const end=toDate?new Date(`${toDate}T23:59:59.999`).getTime():Number.POSITIVE_INFINITY;
  const filtered=p.billingEvents.filter((event:Row)=>{
    const at=new Date(event.event_date).getTime();
    return (!Number.isNaN(at)&&at>=start&&at<=end)
      &&(stateFilter==="all"||event.state===stateFilter)
      &&(planFilter==="all"||event.new_plan===planFilter||(!event.new_plan&&event.previous_plan===planFilter))
      &&(typeFilter==="all"||event.event_type===typeFilter)
      &&(statusFilter==="all"||event.payment_status===statusFilter);
  });
  const paid=filtered.filter((event:Row)=>/paid|succeeded/i.test(String(event.payment_status||"")));
  const subscriptionRevenue=paid.reduce((sum:number,event:Row)=>sum+Number(event.amount_collected||0),0);
  const upgradeRevenue=paid.filter((event:Row)=>event.event_type==="Upgrade").reduce((sum:number,event:Row)=>sum+Number(event.amount_collected||0),0);
  const refunds=filtered.filter((event:Row)=>event.event_type==="Refund"&&!/failed|canceled/i.test(String(event.payment_status||""))).reduce((sum:number,event:Row)=>sum+Number(event.amount_refunded||0),0);
  const credits=filtered.filter((event:Row)=>event.event_type==="Credit"&&!/void/i.test(String(event.payment_status||""))).reduce((sum:number,event:Row)=>sum+Number(event.amount_credited||0),0);
  const failed=filtered.filter((event:Row)=>/failed/i.test(String(event.payment_status||""))||/failed/i.test(String(event.event_type||""))).length;
  const activeSubscriptions=p.subscriptions.filter((subscription:Row)=>["active","trialing"].includes(String(subscription.status||"").toLowerCase())).length;
  const scheduledDowngrades=p.subscriptions.filter((subscription:Row)=>Boolean(subscription.scheduled_tier)).length;
  const scheduledCancellations=p.subscriptions.filter((subscription:Row)=>Boolean(subscription.cancel_at_period_end)).length;
  return <>
    <div className="rounded-[14px] border border-plum/10 bg-white/75 p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><label className="text-[10px] font-bold">From<input type="date" value={fromDate} onChange={event=>setFromDate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs"/></label><label className="text-[10px] font-bold">To<input type="date" value={toDate} onChange={event=>setToDate(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs"/></label><FinanceSelect label="State" value={stateFilter} onChange={setStateFilter} options={US_STATES.map(([code,name])=>[code,name])}/><FinanceSelect label="Plan" value={planFilter} onChange={setPlanFilter} options={[["Basic","Basic"],["Growth","Growth"],["Premium","Premium"]]}/><FinanceSelect label="Transaction" value={typeFilter} onChange={setTypeFilter} options={eventTypes.map(value=>[value,value])}/><FinanceSelect label="Payment status" value={statusFilter} onChange={setStatusFilter} options={paymentStatuses.map(value=>[value,value])}/></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Subscription revenue collected" value={minorMoney(subscriptionRevenue,"usd")}/><Stat label="Upgrade proration collected" value={minorMoney(upgradeRevenue,"usd")}/><Stat label="Refunds issued" value={minorMoney(refunds,"usd")}/><Stat label="Credits issued" value={minorMoney(credits,"usd")}/><Stat label="Failed payments" value={failed}/><Stat label="Active subscriptions" value={activeSubscriptions}/><Stat label="Scheduled downgrades" value={scheduledDowngrades}/><Stat label="Scheduled cancellations" value={scheduledCancellations}/></div>
    <div className="mt-5"><Panel title="Plan-change requests and provider confirmation"><p className="mb-4 text-xs leading-5 text-ink/55">Requests appear before entitlement changes. Paid access is granted only after Stripe confirms both the invoice and resulting subscription price.</p><DataTable headers={["Requested","Salon / ID","Plan change","Status / source","Credit","Charge","Collected / pending","Invoice / payment"]}>{p.changeRequests.length?p.changeRequests.map((request:Row)=>{const salon=p.salons.find((item:Row)=>item.id===request.salon_id);return <tr key={request.id} className="border-b border-plum/10 align-top"><Td>{dateTime(request.requested_at)}{request.effective_at?<span className="mt-1 block text-ink/50">Effective {dateTime(request.effective_at)}</span>:null}</Td><Td><b>{salon?.name||"Salon unavailable"}</b><span className="mt-1 block max-w-40 break-all text-[9px] text-ink/50">{request.salon_id}</span></Td><Td>{request.previous_plan} → {request.new_plan}<span className="mt-1 block text-ink/50">{request.change_timing}</span></Td><Td><Badge value={request.status}/><span className="mt-1 block text-ink/50">{request.event_source}</span>{request.failure_reason?<span className="mt-1 block max-w-48 text-red-600">{request.failure_reason}</span>:null}</Td><Td>{minorMoney(Number(request.proration_credit||0),request.currency)}</Td><Td>{minorMoney(Number(request.proration_charge||0),request.currency)}</Td><Td>{minorMoney(Number(request.amount_collected||0),request.currency)}<span className="mt-1 block text-ink/50">Pending {minorMoney(Number(request.amount_pending||0),request.currency)}</span></Td><Td><span className="block max-w-44 break-all text-[9px]">Invoice {request.stripe_invoice_id||"—"}</span><span className="mt-1 block max-w-44 break-all text-[9px]">Payment {request.stripe_payment_reference||"—"}</span></Td></tr>}):<EmptyTable columns={8} text="No plan-change requests have been recorded."/>}</DataTable></Panel></div>
    <div className="mt-5"><Panel title="Stripe subscription event ledger"><p className="mb-4 text-xs leading-5 text-ink/55">Amounts are stored from Stripe invoices, refunds, and credit notes. State and market are snapshots from the salon record when each event was received.</p><DataTable headers={["Date","Salon / market","Event","Plan change","Timing / effective","Collected","Refunded","Credited","Payment","Stripe references"]}>{filtered.length?filtered.map((event:Row)=><tr key={event.id||event.stripe_event_id} className="border-b border-plum/10 align-top"><Td>{dateTime(event.event_date)}</Td><Td><b>{event.salon_name||"Salon unavailable"}</b><span className="mt-1 block text-ink/50">{[event.state,event.market_snapshot].filter(Boolean).join(" · ")||"Location not recorded"}</span></Td><Td><Badge value={event.event_type}/>{event.failure_reason?<span className="mt-2 block max-w-48 text-red-600">{event.failure_reason}</span>:null}</Td><Td>{event.previous_plan||event.new_plan?<span>{event.previous_plan||"—"} {event.previous_plan&&event.new_plan?"→":""} {event.new_plan||""}</span>:"—"}</Td><Td>{event.change_timing||"—"}<span className="mt-1 block text-ink/50">{event.effective_at?dateTime(event.effective_at):""}</span>{event.event_type==="Cancellation scheduled"?<span className="mt-1 block text-ink/50">Paid through {date(event.paid_through_date)}</span>:null}</Td><Td>{minorMoney(Number(event.amount_collected||0),event.currency)}</Td><Td>{minorMoney(Number(event.amount_refunded||0),event.currency)}</Td><Td>{minorMoney(Number(event.amount_credited||0),event.currency)}</Td><Td><Badge value={event.payment_status||"Not recorded"}/></Td><Td><span className="block max-w-40 break-all text-[9px]">Event {event.stripe_event_id}</span>{event.stripe_invoice_id?<span className="mt-1 block max-w-40 break-all text-[9px]">Invoice {event.stripe_invoice_id}</span>:null}{event.stripe_subscription_id?<span className="mt-1 block max-w-40 break-all text-[9px]">Subscription {event.stripe_subscription_id}</span>:null}</Td></tr>):<EmptyTable columns={10} text="No Stripe financial events match these filters."/>}</DataTable></Panel></div>
  </>;
}

function FinanceSelect({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:readonly (readonly [string,string])[]}){return <label className="text-[10px] font-bold">{label}<select value={value} onChange={event=>onChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All</option>{options.map(([option,labelText])=><option value={option} key={option}>{labelText}</option>)}</select></label>}

function Marketing(p: any) {
  const featured = p.salons.filter((salon: Row) => Number(salon.featured_weight || 0) > 0);
  const overview = <div className="grid gap-5 lg:grid-cols-3"><Panel title="Legacy placement weights">{featured.length ? featured.map((salon: Row) => <Line key={salon.id} label={salon.name} meta={`Legacy weight ${salon.featured_weight}`} />) : <EmptyState title="No legacy weights" body="Use Featured Salon campaigns for scheduled placements." />}<Link href="/admin/salons" className="mt-4 block w-full rounded-lg border border-magenta py-2 text-center text-magenta">Manage salons</Link></Panel><Panel title="Salon promotions">{p.promotions.length ? p.promotions.slice(0,5).map((promotion: Row) => <Line key={promotion.id} label={promotion.title || "Promotion"} meta={promotion.status || "Draft"} />) : <EmptyState title="No promotions" body="Salon-created promotions will appear here." />}</Panel><Panel title="Editorial promotions">{p.posts.length ? p.posts.slice(0,5).map((post: Row) => <Line key={post.id} label={post.title} meta={post.status} />) : <EmptyState title="No blog posts" body="Create and publish posts in Content Management." />}<Link href="/admin/content" className="mt-4 block w-full rounded-lg bg-magenta py-3 text-center font-bold text-white">Open Content Management</Link></Panel></div>;
  return <AdminMarketingWorkspace overview={overview}/>;
}

function Subscriptions(p: any) {
  return <AdminSubscriptionsDashboard salons={p.salons} subscriptions={p.subscriptions} billingEvents={p.billingEvents} changeRequests={p.changeRequests}/>;
}

function SettingsTeam(p: any) {
  const conflicts = rows(p.identityConflicts);
  const administrators = rows(p.admins);
  const cards = [
    ["time-zone", "Time-zone preference", "Set the platform administrator display time zone."],
    ["team", "Team members & permissions", "Invite administrators and manage their assigned sections."],
    ["identity", "Protected identity removal", "Review dependencies before eligible test identities are permanently removed."],
  ];
  return <div data-admin-record-landing className="space-y-5"><Panel title="Settings workspaces"><p className="text-sm leading-6 text-ink/70">Choose one focused workspace. Business rules and safe integration status remain in The Engine; editorial publication remains in Content Management; secrets remain only in deployment configuration.</p><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cards.map(([id,label,body])=><Link key={id} href={`/admin/settings/${id}?return=${encodeURIComponent("/admin/settings")}`} className="rounded-xl border border-plum/10 p-4 transition hover:border-magenta hover:bg-blush/20"><h3 className="font-serif text-xl text-plum">{label}</h3><p className="mt-2 text-xs leading-5 text-ink/55">{body}</p><span className="mt-3 inline-flex text-xs font-bold text-magenta">Open workspace →</span></Link>)}</div><div className="mt-4 flex flex-wrap gap-2"><Link href="/admin/engine" className="inline-flex rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white">Open The Engine</Link><Link href="/admin/content" className="inline-flex rounded-lg border border-magenta px-5 py-3 text-xs font-bold text-magenta">Open Content Management</Link></div></Panel><Panel title="Authorized administrators"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{administrators.map((administrator: Row) => <Link key={administrator.id} href={`/admin/settings/member-${administrator.id}?return=${encodeURIComponent("/admin/settings")}`} className="rounded-xl border border-plum/10 p-4 transition hover:border-magenta hover:bg-blush/20"><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg text-plum">{administrator.name || administrator.email || "Administrator"}</h3><p className="mt-1 break-all text-xs text-ink/50">{administrator.email}</p></div><Badge value={administrator.status || "Invited"}/></div><p className="mt-3 text-xs text-ink/60">{administrator.is_super_admin ? "Super Admin · all sections" : administrator.role || "Admin"}</p><span className="mt-3 inline-flex text-xs font-bold text-magenta">Open member record →</span></Link>)}{!administrators.length ? <p className="col-span-full text-sm text-ink/55">No administrator records are available in this view.</p> : null}</div></Panel><Panel title="Identity health"><div className="flex flex-wrap items-center justify-between gap-4"><div><b className="font-serif text-3xl text-plum">{conflicts.length}</b><p className="mt-1 text-xs text-ink/55">identity conflict{conflicts.length === 1 ? "" : "s"} awaiting deliberate review</p></div><Link href={`/admin/settings/identity?return=${encodeURIComponent("/admin/settings")}`} className="rounded-lg border border-magenta px-4 py-2 text-xs font-bold text-magenta">Review protected identities</Link></div></Panel></div>;
}

function recentActivity(p: DataState) {
  return [
    ...p.applications.map((item) => ({ key: `application-${item.id}`, label: `Salon application: ${item.business_name || "Unnamed salon"}`, at: item.submitted_at })),
    ...p.bookings.map((item) => ({ key: `booking-${item.id}`, label: `Booking ${String(item.id).slice(0, 8)}: ${item.status || "Created"}`, at: item.created_at || item.appointment_datetime })),
    ...p.reviews.map((item) => ({ key: `review-${item.id}`, label: `Review submitted: ${Number(item.rating_overall || 0).toFixed(1)} rating`, at: item.created_at })),
    ...p.customers.map((item) => ({ key: `customer-${item.id}`, label: `Customer registered: ${item.name || item.email || "Customer"}`, at: item.created_at })),
  ].filter((item) => item.at).sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()).slice(0, 6);
}

function dailySeries(rows: Row[], dateField: string, value: (row: Row) => number) {
  const days = Array.from({ length: 14 }, (_, index) => { const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (13 - index)); return day; });
  return days.map((day) => rows.filter((row) => { const parsed = new Date(row[dateField]); return !Number.isNaN(parsed.getTime()) && parsed.toDateString() === day.toDateString(); }).reduce((sum, row) => sum + value(row), 0));
}

function isPaidDeposit(booking: Row) { return /paid|succeeded|complete/i.test(String(booking.deposit_status || booking.payment_status || "")); }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="rounded-[10px] bg-blush/30 p-4 text-center text-[10px] font-semibold text-plum">{label}</Link>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[14px] border border-plum/10 bg-white/75 p-5 shadow-[0_8px_26px_rgba(13,17,20,.03)]"><h2 className="mb-4 font-serif text-xl font-semibold text-plum">{title}</h2>{children}</section>; }
function Line({ label, meta = "" }: { label: string; meta?: string }) { return <div className="flex items-center justify-between gap-4 border-b border-plum/10 py-3 text-xs"><span>{label}</span><span className="text-right text-ink/45">{meta}</span></div>; }
function RecordLine({ href, label, meta = "" }: { href: string; label: string; meta?: string }) { return <Link href={href} className="flex items-center justify-between gap-4 border-b border-plum/10 py-3 text-xs transition hover:text-magenta"><span>{label}</span><span className="text-right text-ink/45">{meta} →</span></Link>; }
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="rounded-[12px] border border-dashed border-plum/15 bg-cream/50 p-5 text-center"><h3 className="font-serif text-lg text-plum">{title}</h3><p className="mt-1 text-xs leading-5 text-ink/55">{body}</p></div>; }
function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-cream/70"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-3">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function EmptyTable({ columns, text }: { columns: number; text: string }) { return <tr><td colSpan={columns} className="px-3 py-10 text-center text-ink/50">{text}</td></tr>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="max-w-64 px-3 py-3">{children}</td>; }
function Badge({ value }: { value?: string }) { const label = value || "Pending"; const good = /active|verified|published|confirmed|approved/i.test(label); const bad = /reject|suspend|flag|remove/i.test(label); return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[9px] ${good ? "bg-emerald-50 text-emerald-700" : bad ? "bg-red-50 text-red-600" : "bg-amber/15 text-amber-700"}`}>{label}</span>; }
function DataChart({ title, values, empty, moneyValues = false }: { title: string; values: number[]; empty: string; moneyValues?: boolean }) { const max = Math.max(...values, 0); return <Panel title={title}>{max === 0 ? <EmptyState title="No data yet" body={empty} /> : <><div className="flex h-48 items-end gap-2 border-b border-l border-plum/10 px-4">{values.map((value, index) => <span key={index} title={moneyValues ? money(value) : String(value)} className="w-full rounded-t bg-magenta" style={{ height: `${Math.max(3, (value / max) * 100)}%` }} />)}</div><p className="mt-3 text-center text-xs text-ink/50">Last 14 days · database records only</p></>}</Panel>; }
function money(value: number) { return value.toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function minorMoney(value: number, currency: unknown) { try { return (Number(value || 0) / 100).toLocaleString("en-US", { style: "currency", currency: String(currency || "usd").toUpperCase() }); } catch { return `${String(currency || "usd").toUpperCase()} ${(Number(value || 0) / 100).toFixed(2)}`; } }
function date(value?: string) { return value ? formatZonedDate(value, "America/New_York") : "—"; }
function dateTime(value?: string, timeZone?: string) { return value ? formatZonedDateTime(value, timeZone || "America/New_York") : "—"; }
function subtitle(section: AdminSection) { return ({ overview: "Live platform records at a glance.", submissions: "Review salon applications organized by state.", salons: "Manage verification, status, plans, and marketplace profiles.", customers: "View and support Girlz Culture customers.", bookings: "Monitor and create bookings across the marketplace.", quality: "Protect service quality using verified review and complaint data.", reviews: "Moderate published, flagged, and disputed reviews.", finance: "Audit Stripe subscription invoices, plan changes, refunds, credits, and failures by state.", marketing: "Manage placements, promotions, and editorial content.", content: "Edit public pages, labels, images, policies, and blog posts.", support: "Manage customer support requests.", complaints: "Review and respond to customer complaints.", subscriptions: "Review plan tiers and Stripe subscription records.", engine: "Govern platform behavior, defaults, publication, and integration readiness.", settings: "Review platform configuration and authorized admin access." })[section]; }
