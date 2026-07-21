/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3, Bell, Building2, CalendarDays, CircleDollarSign, ClipboardList, CreditCard,
  FileText, Flag, Headphones, Home, Menu, MessageSquare, Search, Settings, SlidersHorizontal, Star, UsersRound,
} from "lucide-react";
import { adminSupabase as supabase, getSessionForScope } from "@/lib/supabase";
import AdminContentManager from "@/components/AdminContentManager";
import AdminSupportInbox from "@/components/AdminSupportInbox";
import RoleLogoutButton, { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";
import TeamUserManager from "@/components/auth/TeamUserManager";
import AdminBookingEditor from "@/components/admin/AdminBookingEditor";
import BookingInbox from "@/components/BookingInbox";
import AdminHomepageMarketing from "@/components/admin/AdminHomepageMarketing";
import AdminPromoCodes from "@/components/admin/AdminPromoCodes";
import AdminSalonsManager from "@/components/admin/AdminSalonsManager";
import AdminMarketingWorkspace from "@/components/admin/AdminMarketingWorkspace";
import EngineControlCenter from "@/components/admin/EngineControlCenter";
import { US_STATES } from "@/lib/usStates";

export type AdminSection = "overview" | "submissions" | "salons" | "customers" | "bookings" | "quality" | "reviews" | "finance" | "marketing" | "content" | "support" | "complaints" | "subscriptions" | "engine" | "settings";
type Row = Record<string, any>;
type DataState = {
  salons: Row[]; applications: Row[]; customers: Row[]; bookings: Row[]; reviews: Row[]; tickets: Row[];
  subscriptions: Row[]; complaints: Row[]; admins: Row[]; promotions: Row[]; posts: Row[]; settings: Row[]; billingEvents: Row[];
  identityConflicts: Row[];
};

const emptyData: DataState = { salons: [], applications: [], customers: [], bookings: [], reviews: [], tickets: [], subscriptions: [], complaints: [], admins: [], promotions: [], posts: [], settings: [], billingEvents: [], identityConflicts: [] };
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const navigation: Array<[AdminSection, string, typeof Home]> = [
  ["overview", "Overview", Home], ["submissions", "Submissions", ClipboardList], ["salons", "Salons", Building2],
  ["customers", "Customers", UsersRound], ["bookings", "Bookings", CalendarDays], ["quality", "Quality & Performance", Star],
  ["reviews", "Reviews", MessageSquare], ["finance", "Payments & Finance", CircleDollarSign], ["marketing", "Marketing & Promotions", BarChart3],
  ["content", "Content Management", FileText], ["support", "Customer Support", Headphones], ["complaints", "Complaints", Flag], ["subscriptions", "Subscriptions", CreditCard],
  ["engine", "The Engine", SlidersHorizontal],
  ["settings", "Settings & Team", Settings],
];

const permissionForSection = (section: AdminSection) => section === "complaints" ? "support" : section === "engine" ? "settings" : section;
type InboxCounts = { support: number; complaints: number };

export default function AdminDashboard({ section }: { section: AdminSection; preview?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DataState>(emptyData);
  const [selected, setSelected] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [access, setAccess] = useState<Record<string, boolean> | null>(null);
  const [denied, setDenied] = useState(false);
  const [inboxCounts, setInboxCounts] = useState<InboxCounts>({ support: 0, complaints: 0 });

  async function load() {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Admin sign-in required. Your salon-owner session remains signed in separately.");
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const verification = await fetch("/api/admin/verify", { method: "POST", headers });
    if (!verification.ok) throw new Error("This saved admin session is no longer authorized. Sign in with an active platform-admin account.");
    const verified = await verification.json() as { permissions?: Record<string,boolean>; is_super_admin?: boolean };
    const verifiedAccess = verified.is_super_admin ? null : verified.permissions || {};
    setAccess(verifiedAccess);
    if (verifiedAccess !== null && !verifiedAccess[permissionForSection(section)]) {
      setDenied(true);
      setData(emptyData);
      setSelected(null);
      return;
    }
    setDenied(false);
    const response = await fetch(`/api/admin/data?section=${encodeURIComponent(section)}`, { headers, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load admin data.");
    const next: DataState = {
      salons: rows(body.salons), applications: rows(body.salon_applications), customers: rows(body.customers),
      bookings: rows(body.bookings), reviews: rows(body.reviews), tickets: rows(body.support_tickets),
      subscriptions: rows(body.subscriptions), complaints: rows(body.complaints_log), admins: rows(body.admin_users),
      promotions: rows(body.salon_promotions), posts: rows(body.blog_posts), settings: rows(body.admin_settings), billingEvents: rows(body.billing_events), identityConflicts: rows(body.identity_conflict_queue),
    };
    setData(next);
    setSelected((current) => current ? next.applications.find((item) => item.id === current.id) || null : next.applications[0] || null);
    if (verifiedAccess === null || verifiedAccess.support) {
      const countsResponse = await fetch("/api/admin/inbox-counts", { headers, cache: "no-store" });
      if (countsResponse.ok) {
        const counts = await countsResponse.json() as Partial<InboxCounts>;
        setInboxCounts({ support: Number(counts.support || 0), complaints: Number(counts.complaints || 0) });
      } else {
        console.error("Admin inbox counts load failed", await countsResponse.text());
      }
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try { await load(); }
      catch (loadError) { console.error("Admin dashboard load error", loadError); if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load admin data."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  // The selected section is fixed for each route-mounted dashboard instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(id: string, decision: "approve" | "reject" | "activate") {
    const reason = decision === "reject" ? window.prompt("Reason for rejection:") || "Application did not meet current requirements." : undefined;
    const session = await getSessionForScope("admin");
    if (!session) { setNotice("Your admin session has expired."); return; }
    const response = await fetch(`/api/admin/submissions/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ decision, reason }) });
    const body = await response.json();
    if (!response.ok) { setNotice(body.error || "Unable to update application."); return; }
    await load();
    setNotice(decision === "activate" ? "Salon activated and dashboard access updated." : `Application ${String(body.status).toLowerCase()}.`);
  }

  async function update(table: string, id: string, changes: Row) {
    const { error: updateError } = await supabase.from(table).update(changes).eq(table === "admin_settings" ? "key" : "id", id);
    if (updateError) { console.error("Admin record update failed", { table, id, updateError }); setNotice(updateError.message); return; }
    await load();
    setNotice("Saved.");
  }

  if (loading) return <div className="min-h-screen bg-cream p-12 text-center text-plum">Loading platform administration…</div>;
  if (error) return <div className="grid min-h-screen place-items-center bg-cream p-5"><div className="rounded-2xl bg-white p-8 text-center"><h1 className="font-serif text-3xl text-plum">Admin access</h1><p className="mt-3">{error}</p><Link href="/admin/login" className="mt-5 inline-flex rounded-lg bg-magenta px-5 py-3 text-sm font-bold text-white">Go to admin login</Link></div></div>;
  if (denied) {
    const firstAllowed = navigation.find(([id]) => access?.[permissionForSection(id)])?.[0];
    const firstAllowedHref = firstAllowed === "overview" ? "/admin" : firstAllowed ? `/admin/${firstAllowed}` : "/admin/login";
    return <AdminShell section={section} access={access} inboxCounts={inboxCounts}><RoleSessionBoundary scope="admin" /><div className="mx-auto max-w-2xl rounded-[18px] border border-plum/10 bg-white p-10 text-center"><Settings className="mx-auto text-magenta" /><h1 className="mt-4 font-serif text-3xl text-plum">Access not assigned</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-ink/70">Your platform-admin role does not include this section. Ask a Super Admin to update your permissions.</p><Link href={firstAllowedHref} className="mt-5 inline-flex rounded-lg bg-magenta px-5 py-3 font-bold text-white">Open an assigned section</Link></div></AdminShell>;
  }

  return <AdminShell section={section} access={access} inboxCounts={inboxCounts}><RoleSessionBoundary scope="admin" />
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-serif text-[40px] font-semibold leading-none text-plum">{navigation.find((item) => item[0] === section)?.[1]}</h1><p className="mt-2 text-sm text-ink/55">{subtitle(section)}</p></div><div className="flex items-center gap-3 rounded-[11px] border border-plum/10 bg-white px-4 py-3 text-xs"><Search size={17} /><input className="w-64 bg-transparent outline-none" placeholder="Search platform records" /><Bell size={19} /></div></div>
    {notice ? <div className="mb-4 rounded-lg bg-blush/55 p-3 text-sm text-plum">{notice}</div> : null}
    <AdminSectionView section={section} data={data} selected={selected} setSelected={setSelected} decide={decide} update={update} onCreated={load} onTicketRead={(mode) => setInboxCounts((counts) => ({ ...counts, [mode]: Math.max(0, counts[mode] - 1) }))} />
  </AdminShell>;
}

function AdminShell({ section, children, access, inboxCounts }: { section: AdminSection; children: React.ReactNode; access: Record<string,boolean>|null; inboxCounts: InboxCounts }) {
  const visibleNavigation = access === null ? navigation : navigation.filter(([id]) => access[permissionForSection(id)]);
  const mobileNavigation = ([
    ["overview", "Overview", Home], ["bookings", "Bookings", CalendarDays], ["submissions", "Alerts", Bell], ["quality", "Reports", BarChart3], ["settings", "More", Menu],
  ] as Array<[AdminSection, string, typeof Home]>).filter(([id]) => access === null || access[permissionForSection(id)]);
  const homeId = visibleNavigation[0]?.[0];
  const homeHref = homeId === "overview" ? "/admin" : homeId ? `/admin/${homeId}` : "/admin/login";
  const navCount = (id: AdminSection) => id === "support" ? inboxCounts.support : id === "complaints" ? inboxCounts.complaints : 0;
  return <div className="min-h-screen bg-cream text-ink lg:grid lg:grid-cols-[220px_1fr]"><aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] overflow-y-auto bg-[linear-gradient(160deg,#25102d,#16081d)] p-4 text-white lg:block"><Link href={homeHref} className="block px-3 py-4 font-serif text-2xl font-bold">Girlz Culture</Link><nav className="mt-3 space-y-1">{visibleNavigation.map(([id, label, Icon]) => <Link key={id} href={id === "overview" ? "/admin" : `/admin/${id}`} className={`flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[11px] ${section === id ? "bg-magenta text-white" : "text-white/80 hover:bg-white/10"}`}><Icon size={17} />{label}{navCount(id) ? <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-magenta">{navCount(id)}</span> : null}</Link>)}</nav><div className="absolute bottom-5 left-4 right-4 space-y-2"><Link href="/contact" className="block rounded-[10px] border border-white/20 p-3 text-xs">Need help?<br /><span className="text-white/60">Contact support</span></Link><RoleLogoutButton scope="admin" className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-sm text-white/85 hover:bg-white/10" /></div></aside><main className="min-w-0 px-4 pb-24 pt-5 sm:px-6 lg:col-start-2 lg:px-8 lg:pb-8"><header className="mb-5 flex items-center justify-between lg:hidden"><details><summary className="list-none"><Menu /></summary><nav className="absolute left-4 z-50 mt-3 w-72 rounded-xl bg-white p-2 shadow-2xl">{visibleNavigation.map(([id, label, Icon]) => <Link key={id} href={id === "overview" ? "/admin" : `/admin/${id}`} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm"><Icon size={17} />{label}{navCount(id) ? <span className="ml-auto rounded-full bg-magenta px-2 py-0.5 text-[9px] font-bold text-white">{navCount(id)}</span> : null}</Link>)}</nav></details><b className="font-serif text-xl text-plum">Girlz Culture</b><div className="flex items-center gap-2"><Bell /><RoleLogoutButton scope="admin" compact className="flex h-10 w-10 items-center justify-center rounded-full text-plum hover:bg-blush" /></div></header>{children}</main><nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-plum/10 bg-white p-2 lg:hidden">{mobileNavigation.map(([id, label, Icon]) => <Link key={id} href={id === "overview" ? "/admin" : `/admin/${id}`} className={`flex min-w-14 flex-col items-center gap-1 text-[9px] ${section === id ? "text-magenta" : ""}`}><Icon size={19} />{label}</Link>)}</nav></div>;
}

function AdminSectionView({ section, data, selected, setSelected, decide, update, onCreated, onTicketRead }: { section: AdminSection; data: DataState; selected: Row | null; setSelected: (row: Row) => void; decide: (id: string, decision: "approve" | "reject" | "activate") => void; update: (table: string, id: string, changes: Row) => Promise<void>; onCreated: () => Promise<void>; onTicketRead: (mode: "support" | "complaints") => void }) {
  // Missing API arrays are normalized here as a final render guard. Every
  // section can now show its existing empty state instead of crashing.
  const safeData: DataState = {
    salons: rows(data?.salons), applications: rows(data?.applications), customers: rows(data?.customers),
    bookings: rows(data?.bookings), reviews: rows(data?.reviews), tickets: rows(data?.tickets),
    subscriptions: rows(data?.subscriptions), complaints: rows(data?.complaints), admins: rows(data?.admins),
    promotions: rows(data?.promotions), posts: rows(data?.posts), settings: rows(data?.settings), billingEvents: rows(data?.billingEvents), identityConflicts: rows(data?.identityConflicts),
  };
  const props = { ...safeData, selected, setSelected, decide, update, onCreated };
  switch (section) {
    case "overview": return <Overview {...props} />;
    case "submissions": return <Submissions {...props} />;
    case "salons": return <AdminSalonsManager />;
    case "customers": return <Customers {...props} />;
    case "bookings": return <Bookings {...props} />;
    case "quality": return <Quality {...props} />;
    case "reviews": return <Reviews {...props} />;
    case "finance": return <Finance {...props} />;
    case "marketing": return <AdminMarketingWorkspace overview={<div className="space-y-5"><AdminPromoCodes /><Marketing {...props} /></div>} />;
    case "content": return <AdminContentManager />;
    case "support": return <div className="space-y-6"><AdminSupportInbox initialTickets={safeData.tickets} mode="support" onRead={onTicketRead} /><BookingInbox scope="admin" /></div>;
    case "complaints": return <AdminSupportInbox initialTickets={safeData.tickets} mode="complaints" onRead={onTicketRead} />;
    case "subscriptions": return <Subscriptions {...props} />;
    case "engine": return <EngineControlCenter />;
    default: return <SettingsTeam {...props} />;
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <article className="rounded-[14px] border border-plum/10 bg-white/75 p-4"><p className="text-[10px] font-semibold text-ink/60">{label}</p><b className="mt-2 block font-serif text-2xl text-ink">{value}</b></article>;
}

function Overview(p: DataState) {
  const activeSalons = p.salons.filter((salon) => String(salon.status).toLowerCase() === "active").length;
  const completedRevenue = p.bookings.filter((booking) => String(booking.status).toLowerCase() === "completed").reduce((sum, booking) => sum + Number(booking.estimated_total || 0), 0);
  const deposits = p.bookings.filter(isPaidDeposit).reduce((sum, booking) => sum + Number(booking.deposit_amount || 0), 0);
  const activity = recentActivity(p);
  const bookingSeries = dailySeries(p.bookings, "appointment_datetime", () => 1);
  const revenueSeries = dailySeries(p.bookings.filter((booking) => String(booking.status).toLowerCase() === "completed"), "appointment_datetime", (booking) => Number(booking.estimated_total || 0));
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Total Salons", p.salons.length], ["Active Salons", activeSalons], ["Pending Submissions", p.applications.filter((item) => item.status === "Pending").length], ["Total Customers", p.customers.length], ["Total Bookings", p.bookings.length], ["Completed Booking Value", money(completedRevenue)], ["Deposits Collected", money(deposits)]].map(([label, value]) => <Stat key={label as string} label={label as string} value={value as string | number} />)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr_1fr]"><Panel title="Recent Activity">{activity.length ? activity.map((item) => <Line key={item.key} label={item.label} meta={dateTime(item.at)} />) : <EmptyState title="No activity yet" body="Applications, bookings, reviews, and registrations will appear here." />}</Panel><Panel title="Alerts"><Line label={`${p.applications.filter((item) => item.status === "Pending").length} pending submissions`} meta="Require review" /><Line label={`${p.reviews.filter((review) => review.dispute_status && review.dispute_status !== "None").length} disputed reviews`} meta="Need attention" /><Line label={`${p.salons.filter((salon) => Number(salon.review_count || 0) > 0 && Number(salon.rating_overall) < 3.5).length} salons below threshold`} meta="Based on reviews" /></Panel><Panel title="Quick Actions"><div className="grid grid-cols-2 gap-3"><QuickLink href="/admin/submissions" label="Review submissions" /><QuickLink href="/admin/salons" label="Manage salons" /><QuickLink href="/admin/content" label="Create blog post" /><QuickLink href="/admin/quality" label="View reports" /></div></Panel></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><DataChart title="Bookings Overview" values={bookingSeries} empty="No booking activity yet." /><DataChart title="Completed Booking Value" values={revenueSeries} empty="Completed bookings will create this report." moneyValues /></div></>;
}

function Submissions(p: any) {
  const states = [...new Set(p.applications.map((item: Row) => item.state || "State not provided"))] as string[];
  const [state, setState] = useState(states[0] || "");
  const selectedState = states.includes(state) ? state : states[0] || "";
  const rows = p.applications.filter((item: Row) => (item.state || "State not provided") === selectedState);
  if (!p.applications.length) return <EmptyState title="No salon submissions yet" body="New salon applications will be grouped by state here." />;
  return <div className="grid min-w-0 gap-5 xl:grid-cols-[1.2fr_.8fr]"><section className="min-w-0 rounded-[14px] border border-plum/10 bg-white p-4"><div className="flex gap-2 overflow-x-auto border-b border-plum/10 pb-3">{states.map((item) => <button key={item} onClick={() => setState(item)} className={`shrink-0 rounded-full px-4 py-2 text-xs ${selectedState === item ? "bg-magenta text-white" : "bg-blush/30"}`}>{item} <b>{p.applications.filter((application: Row) => (application.state || "State not provided") === item).length}</b></button>)}</div><DataTable headers={["Business Name", "Owner / Contact", "Submitted", "Status", "Review"]}>{rows.map((application: Row) => <tr key={application.id} onClick={() => p.setSelected(application)} className="border-b border-plum/10 hover:bg-blush/20"><Td>{application.business_name}</Td><Td>{application.owner_name}</Td><Td>{date(application.submitted_at)}</Td><Td><Badge value={application.status} /></Td><Td><Link href={`/admin/submissions/${application.id}`} onClick={(event) => event.stopPropagation()} className="font-bold text-magenta">Full details</Link></Td></tr>)}</DataTable></section><ApplicationDetails application={p.selected} decide={p.decide} /></div>;
}

function ApplicationDetails({ application, decide }: { application: Row | null; decide: (id: string, decision: "approve" | "reject" | "activate") => void }) {
  return <Panel title={application?.business_name || "Application details"}>{application ? <div className="space-y-4 text-sm"><Badge value={application.status} />{[["Owner", application.owner_name], ["Email", application.business_email], ["Phone", application.phone], ["Location", [application.city, application.state].filter(Boolean).join(", ")], ["Type", application.business_type || "Not provided"], ["Years operating", application.years_in_operation], ["Stylists", application.stylist_count], ["Plan", application.selected_plan]].map(([label, value]) => <div key={label}><b>{label}</b><p className="text-ink/60">{value || "Not provided"}</p></div>)}{application.logo_url ? <img src={application.logo_url} alt="Salon logo" className="h-20 w-20 rounded-lg object-cover" /> : null}{application.photo_urls?.length ? <div><b>Photos</b><div className="mt-2 grid grid-cols-3 gap-2">{application.photo_urls.map((url: string) => <a href={url} target="_blank" rel="noreferrer" key={url}><img src={url} alt="Application upload" className="h-20 w-full rounded-lg object-cover" /></a>)}</div></div> : null}{application.document_urls?.length ? <div><b>Documents</b>{application.document_urls.map((url: string, index: number) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-1 block text-magenta">Open document {index + 1}</a>)}</div> : null}<Link href={`/admin/submissions/${application.id}`} className="block rounded-lg border border-plum/15 py-3 text-center font-bold text-magenta">Open full application</Link><div className="grid grid-cols-2 gap-3">{application.status === "Pending" ? <><button onClick={() => decide(application.id, "approve")} className="rounded-lg bg-magenta py-3 font-bold text-white">Approve</button><button onClick={() => decide(application.id, "reject")} className="rounded-lg border border-magenta py-3 font-bold text-magenta">Reject</button></> : application.status === "Approved" ? <button onClick={() => decide(application.id, "activate")} className="col-span-2 rounded-lg bg-plum py-3 font-bold text-white">Activate salon dashboard</button> : null}</div></div> : <p>Select an application.</p>}</Panel>;
}

function Customers(p: any) {
  return <Panel title="Customers"><DataTable headers={["Customer Name", "Email", "Joined", "Bookings", "Status"]}>{p.customers.length ? p.customers.map((customer: Row) => <tr key={customer.id} className="border-b"><Td>{customer.name || "Customer"}</Td><Td>{customer.email}</Td><Td>{date(customer.created_at)}</Td><Td>{p.bookings.filter((booking: Row) => booking.customer_id === customer.id).length}</Td><Td><Badge value={customer.status || "Active"} /></Td></tr>) : <EmptyTable columns={5} text="No customer accounts yet." />}</DataTable></Panel>;
}

function Bookings(p: any) {
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState<string|null>(null);
  return <>{editing ? <AdminBookingEditor bookingId={editing} close={() => setEditing(null)} saved={p.onCreated} /> : null}<div className="mb-4 flex justify-end"><button onClick={() => setManual(!manual)} className="rounded-lg bg-magenta px-5 py-3 text-sm font-bold text-white">{manual ? "Close booking form" : "Create booking manually"}</button></div>{manual ? <ManualBooking salons={p.salons} onCreated={p.onCreated} /> : null}<Panel title="All Bookings"><DataTable headers={["Booking ID", "Salon", "Customer", "Date & Time", "Status", "Deposit", "Source", "Actions"]}>{p.bookings.length ? p.bookings.map((booking: Row) => { const salon = p.salons.find((row: Row) => row.id === booking.salon_id); return <tr key={booking.id} className="border-b"><Td>{String(booking.id).slice(0, 10)}</Td><Td>{salon?.name || "Salon unavailable"}</Td><Td>{booking.guest_name || "Customer"}</Td><Td>{dateTime(booking.appointment_datetime, salon?.time_zone)}</Td><Td><Badge value={booking.status} /></Td><Td>{money(Number(booking.deposit_amount || 0))}</Td><Td>{booking.source || "Website"}</Td><Td><button type="button" onClick={() => setEditing(String(booking.id))} className="rounded-lg border border-magenta px-3 py-2 font-bold text-magenta">Manage</button></Td></tr>; }) : <EmptyTable columns={8} text="No bookings yet." />}</DataTable></Panel></>;
}

function ManualBooking({ salons, onCreated }: { salons: Row[]; onCreated: () => Promise<void> }) {
  const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    try { const form = new FormData(event.currentTarget); const session = await getSessionForScope("admin"); if (!session) throw new Error("Your admin session has expired."); const response = await fetch("/api/admin/bookings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ salon_id: form.get("salon"), guest_name: form.get("name"), guest_email: form.get("email"), guest_phone: form.get("phone"), appointment_local: form.get("date") }) }); const body = await response.json(); if (!response.ok) throw new Error(body.next_available ? `${body.error} Next available: ${body.next_available.date} at ${body.next_available.label}.` : body.error || "Unable to create booking."); setMessage("Booking created and synced to the salon calendar."); event.currentTarget.reset(); await onCreated(); }
    catch (submitError) { setMessage(submitError instanceof Error ? submitError.message : "Unable to create booking."); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="mb-5 grid gap-3 rounded-[14px] border border-magenta/20 bg-blush/20 p-5 sm:grid-cols-2 lg:grid-cols-6"><select name="salon" required className="rounded-lg border p-3"><option value="">Choose salon</option>{salons.map((salon) => <option value={salon.id} key={salon.id}>{salon.name}</option>)}</select><input name="name" required placeholder="Customer name" className="rounded-lg border p-3" /><input name="email" type="email" required placeholder="name@example.com" className="rounded-lg border p-3" /><input name="phone" type="tel" required placeholder="+1 (555) 123-4567" className="rounded-lg border p-3" /><input name="date" type="datetime-local" required className="rounded-lg border p-3" /><button disabled={saving} className="rounded-lg bg-plum px-3 font-bold text-white disabled:opacity-60">{saving ? "Creating…" : "Create booking"}</button>{message ? <p className="col-span-full text-sm text-plum">{message}</p> : null}</form>;
}

function Quality(p: any) {
  const rated = p.salons.filter((salon: Row) => Number(salon.review_count || 0) > 0);
  const average = rated.length ? rated.reduce((sum: number, salon: Row) => sum + Number(salon.rating_overall || 0), 0) / rated.length : 0;
  const lateness = p.reviews.filter((review: Row) => /late|wait|delay/i.test(review.written_review || ""));
  const qualitySeries = dailySeries(p.reviews, "created_at", (review) => Number(review.rating_overall || 0));
  const setting=p.settings.find((item:Row)=>item.key==="quality_thresholds");
  const storedThreshold=Number(setting?.value?.salon_cancellation_rate_percent||10);
  const [threshold,setThreshold]=useState(storedThreshold);
  const metrics=p.salons.map((salon:Row)=>{
    const bookings=p.bookings.filter((booking:Row)=>booking.salon_id===salon.id);
    const salonCancellations=bookings.filter((booking:Row)=>booking.cancellation_initiated_by==="Salon").length;
    const cancellationRate=bookings.length?salonCancellations/bookings.length*100:0;
    const measured=bookings.filter((booking:Row)=>booking.service_started_at);
    const onTime=measured.filter((booking:Row)=>new Date(booking.service_started_at).getTime()<=new Date(booking.appointment_datetime).getTime()+15*60_000).length;
    const onTimeRate=measured.length?onTime/measured.length*100:null;
    const bookingIds=new Set(bookings.map((booking:Row)=>booking.id));
    const activeComplaints=p.complaints.filter((complaint:Row)=>complaint.booking_verified&&bookingIds.has(complaint.booking_id)&&!/closed|resolved/i.test(complaint.status||"")).length;
    const complaintFree=bookings.length?Math.max(0,100-Math.min(100,activeComplaints/bookings.length*100)):null;
    let weighted=0;let weight=0;
    if(Number(salon.review_count||0)>0){weighted+=Math.min(100,Number(salon.rating_overall||0)*20)*.4;weight+=.4;}
    if(bookings.length){weighted+=(100-cancellationRate)*.3;weight+=.3;}
    if(onTimeRate!==null){weighted+=onTimeRate*.2;weight+=.2;}
    if(complaintFree!==null){weighted+=complaintFree*.1;weight+=.1;}
    return {...salon,totalBookings:bookings.length,salonCancellations,cancellationRate,onTimeRate,activeComplaints,qualityScore:weight?weighted/weight:null,flagged:cancellationRate>threshold};
  });
  const ranked=[...metrics].filter((salon:Row)=>salon.qualityScore!==null).sort((left:Row,right:Row)=>Number(right.qualityScore)-Number(left.qualityScore));
  const flagged=metrics.filter((salon:Row)=>salon.flagged);
  async function saveThreshold(){await p.update("admin_settings","quality_thresholds",{value:{...(setting?.value||{}),salon_cancellation_rate_percent:threshold}})}
  return <><div className="grid gap-4 sm:grid-cols-4"><Stat label="Platform Average Rating" value={average.toFixed(1)} /><Stat label="Cancellation Flags" value={flagged.length} /><Stat label="Active Complaints" value={p.complaints.filter((item: Row) => !/closed|resolved/i.test(item.status || "")).length} /><Stat label="Published Reviews" value={p.reviews.length} /></div><div className="mt-5 grid gap-5 lg:grid-cols-3"><Panel title="Best-Performing Partners">{ranked.length ? ranked.slice(0, 5).map((salon: Row) => <Line key={salon.id} label={salon.name} meta={`Quality ${Number(salon.qualityScore).toFixed(1)} · cancellations ${Number(salon.cancellationRate).toFixed(1)}%`} />) : <EmptyState title="No quality data" body="Composite scores begin after bookings or verified reviews are recorded." />}</Panel><Panel title="Salons Needing Attention">{flagged.length?flagged.map((salon:Row)=><Line key={salon.id} label={salon.name} meta={`${Number(salon.cancellationRate).toFixed(1)}% salon cancellations (${salon.salonCancellations}/${salon.totalBookings})`}/>):<EmptyState title="No cancellation flags" body={`No salon exceeds the current ${threshold}% threshold.`}/>}</Panel><Panel title="Quality Threshold"><p className="text-xs leading-5 text-ink/60">Auto-flag salons when salon-initiated cancellations exceed this percentage of all bookings.</p><div className="mt-4 flex items-end gap-2"><label className="flex-1 text-[10px] font-bold">Cancellation rate %<input type="number" min="1" max="100" value={threshold} onChange={(event)=>setThreshold(Number(event.target.value))} className="mt-1 min-h-10 w-full rounded-lg border px-3"/></label><button onClick={()=>void saveThreshold()} className="min-h-10 rounded-lg bg-magenta px-4 text-xs font-bold text-white">Save</button></div><Line label="Lateness or long waits" meta={`${lateness.length} reviews`} /><Line label="On-time performance" meta={metrics.some((salon:Row)=>salon.onTimeRate!==null)?"Measured from recorded service start times":"Not measured yet"}/></Panel></div><div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><DataChart title="Review Rating Activity" values={qualitySeries} empty="No review activity yet." /><Panel title="Cancellation Monitoring">{metrics.filter((salon:Row)=>salon.totalBookings>0).sort((a:Row,b:Row)=>Number(b.cancellationRate)-Number(a.cancellationRate)).slice(0,8).map((salon:Row)=><Line key={salon.id} label={salon.name} meta={`${Number(salon.cancellationRate).toFixed(1)}% · ${salon.salonCancellations} salon cancellations`}/>)}</Panel></div></>;
}

function Reviews(p: any) {
  return <Panel title="Reviews & Moderation"><DataTable headers={["Reviewer", "Salon", "Rating", "Review", "Date", "Status", "Actions"]}>{p.reviews.length ? p.reviews.map((review: Row) => <tr key={review.id} className={`border-b ${review.dispute_status && review.dispute_status !== "None" ? "bg-red-50" : ""}`}><Td>{review.customer_name || "Customer"}</Td><Td>{p.salons.find((salon: Row) => salon.id === review.salon_id)?.name || "Salon unavailable"}</Td><Td>{Number(review.rating_overall || 0).toFixed(1)}</Td><Td>{review.written_review || "No written review"}</Td><Td>{date(review.created_at)}</Td><Td><Badge value={review.dispute_status || "Published"} /></Td><Td><select value={review.dispute_status || "Published"} onChange={(event) => p.update("reviews", review.id, { dispute_status: event.target.value })} className="rounded border p-1"><option>Published</option><option>Removed</option><option>Resolved</option></select></Td></tr>) : <EmptyTable columns={7} text="No reviews yet." />}</DataTable></Panel>;
}

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
    <div className="mt-5"><Panel title="Stripe subscription event ledger"><p className="mb-4 text-xs leading-5 text-ink/55">Amounts are stored from Stripe invoices, refunds, and credit notes. State and market are snapshots from the salon record when each event was received.</p><DataTable headers={["Date","Salon / market","Event","Plan change","Timing / effective","Collected","Refunded","Credited","Payment","Stripe references"]}>{filtered.length?filtered.map((event:Row)=><tr key={event.id||event.stripe_event_id} className="border-b border-plum/10 align-top"><Td>{dateTime(event.event_date)}</Td><Td><b>{event.salon_name||"Salon unavailable"}</b><span className="mt-1 block text-ink/50">{[event.state,event.market_snapshot].filter(Boolean).join(" · ")||"Location not recorded"}</span></Td><Td><Badge value={event.event_type}/>{event.failure_reason?<span className="mt-2 block max-w-48 text-red-600">{event.failure_reason}</span>:null}</Td><Td>{event.previous_plan||event.new_plan?<span>{event.previous_plan||"—"} {event.previous_plan&&event.new_plan?"→":""} {event.new_plan||""}</span>:"—"}</Td><Td>{event.change_timing||"—"}<span className="mt-1 block text-ink/50">{event.effective_at?dateTime(event.effective_at):""}</span>{event.event_type==="Cancellation scheduled"?<span className="mt-1 block text-ink/50">Paid through {date(event.paid_through_date)}</span>:null}</Td><Td>{minorMoney(Number(event.amount_collected||0),event.currency)}</Td><Td>{minorMoney(Number(event.amount_refunded||0),event.currency)}</Td><Td>{minorMoney(Number(event.amount_credited||0),event.currency)}</Td><Td><Badge value={event.payment_status||"Not recorded"}/></Td><Td><span className="block max-w-40 break-all text-[9px]">Event {event.stripe_event_id}</span>{event.stripe_invoice_id?<span className="mt-1 block max-w-40 break-all text-[9px]">Invoice {event.stripe_invoice_id}</span>:null}{event.stripe_subscription_id?<span className="mt-1 block max-w-40 break-all text-[9px]">Subscription {event.stripe_subscription_id}</span>:null}</Td></tr>):<EmptyTable columns={10} text="No Stripe financial events match these filters."/>}</DataTable></Panel></div>
  </>;
}

function FinanceSelect({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:readonly (readonly [string,string])[]}){return <label className="text-[10px] font-bold">{label}<select value={value} onChange={event=>onChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All</option>{options.map(([option,labelText])=><option value={option} key={option}>{labelText}</option>)}</select></label>}

function Marketing(p: any) {
  const featured = p.salons.filter((salon: Row) => Number(salon.featured_weight || 0) > 0);
  const overview = <div className="space-y-5"><AdminHomepageMarketing salons={p.salons} /><div className="grid gap-5 lg:grid-cols-3"><Panel title="Legacy placement weights">{featured.length ? featured.map((salon: Row) => <Line key={salon.id} label={salon.name} meta={`Legacy weight ${salon.featured_weight}`} />) : <EmptyState title="No legacy weights" body="Use the Featured Salons tab for paid, scheduled placements." />}<Link href="/admin/salons" className="mt-4 block w-full rounded-lg border border-magenta py-2 text-center text-magenta">Manage salons</Link></Panel><Panel title="Salon Promotions">{p.promotions.length ? p.promotions.map((promotion: Row) => <Line key={promotion.id} label={promotion.title || "Promotion"} meta={promotion.status || "Draft"} />) : <EmptyState title="No promotions" body="Salon-created promotions will appear here." />}</Panel><Panel title="Blog Management">{p.posts.length ? p.posts.map((post: Row) => <Line key={post.id} label={post.title} meta={post.status} />) : <EmptyState title="No blog posts" body="Create and publish posts in Content Management." />}<Link href="/admin/content" className="mt-4 block w-full rounded-lg bg-magenta py-3 text-center font-bold text-white">Open Content Management</Link></Panel></div></div>;
  return <AdminMarketingWorkspace overview={overview}/>;
}

function Subscriptions(p: any) {
  return <><div className="grid gap-5 sm:grid-cols-3">{[["Basic", "$99.50"], ["Growth", "$129.50"], ["Premium", "$159.50"]].map(([name, price]) => <Panel key={name} title={name}><b className="font-serif text-4xl text-plum">{price}<small className="text-sm">/mo</small></b><p className="mt-3 text-sm">{p.salons.filter((salon: Row) => salon.subscription_tier === name).length} salons</p><p className="mt-4 text-xs text-ink/55">Stripe test-mode plan configured for this tier.</p></Panel>)}</div><div className="mt-5"><Panel title="Subscription Records">{p.subscriptions.length ? p.subscriptions.map((subscription: Row) => <Line key={subscription.id} label={p.salons.find((salon: Row) => salon.id === subscription.salon_id)?.name || "Salon"} meta={subscription.status || "Unknown"} />) : <EmptyState title="No subscription records" body="Stripe subscription webhooks will populate this list." />}</Panel></div></>;
}

function SettingsTeam(p: any) {
  const conflicts = rows(p.identityConflicts);
  return <div className="space-y-5"><Panel title="Platform Settings"><p className="text-sm leading-6 text-ink/70">Business rules, defaults, languages, media constraints, and safe integration status now live in The Engine. Public editorial content remains in Content Management; secrets remain in deployment environment variables.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/admin/engine" className="inline-flex rounded-lg bg-magenta px-6 py-3 font-bold text-white">Open The Engine</Link><Link href="/admin/content" className="inline-flex rounded-lg border border-magenta px-6 py-3 font-bold text-magenta">Open Content Management</Link></div></Panel><Panel title="Identity conflict review"><p className="mb-4 text-xs leading-5 text-ink/60">One email may belong to only one Auth user and one primary role. Historical conflicts are listed for deliberate review; the system never merges or deletes them automatically.</p>{conflicts.length?<div className="space-y-3">{conflicts.map((conflict:Row)=><article key={conflict.email_normalized} className="rounded-xl border border-amber/30 bg-amber/5 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b className="break-all text-sm text-plum">{conflict.email_normalized}</b><Badge value={conflict.resolution_status}/></div><p className="mt-2 text-xs text-ink/60">Roles: {Array.isArray(conflict.roles)&&conflict.roles.length?conflict.roles.join(", "):"Review required"}</p><p className="mt-1 text-xs text-ink/50">{Array.isArray(conflict.user_ids)?conflict.user_ids.length:0} Auth user record(s) · {Array.isArray(conflict.records)?conflict.records.length:0} linked record(s)</p>{Array.isArray(conflict.records)?<ul className="mt-3 space-y-1 border-t border-plum/10 pt-3 text-[10px] text-ink/55">{conflict.records.map((record:Row,index:number)=><li key={`${record.record_type}-${record.record_id}-${index}`}>{record.record_type}: {record.role||"Auth identity"} · {String(record.record_id||"").slice(0,12)}</li>)}</ul>:null}</article>)}</div>:<EmptyState title="No identity conflicts" body="Every known email is assigned to one canonical user and one primary role."/>}</Panel><TeamUserManager scope="admin" /></div>;
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
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-[14px] border border-plum/10 bg-white/75 p-5 shadow-[0_8px_26px_rgba(26,18,32,.03)]"><h2 className="mb-4 font-serif text-xl font-semibold text-plum">{title}</h2>{children}</section>; }
function Line({ label, meta = "" }: { label: string; meta?: string }) { return <div className="flex items-center justify-between gap-4 border-b border-plum/10 py-3 text-xs"><span>{label}</span><span className="text-right text-ink/45">{meta}</span></div>; }
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="rounded-[12px] border border-dashed border-plum/15 bg-cream/50 p-5 text-center"><h3 className="font-serif text-lg text-plum">{title}</h3><p className="mt-1 text-xs leading-5 text-ink/55">{body}</p></div>; }
function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-cream/70"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-3">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function EmptyTable({ columns, text }: { columns: number; text: string }) { return <tr><td colSpan={columns} className="px-3 py-10 text-center text-ink/50">{text}</td></tr>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="max-w-64 px-3 py-3">{children}</td>; }
function Badge({ value }: { value?: string }) { const label = value || "Pending"; const good = /active|verified|published|confirmed|approved/i.test(label); const bad = /reject|suspend|flag|remove/i.test(label); return <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[9px] ${good ? "bg-emerald-50 text-emerald-700" : bad ? "bg-red-50 text-red-600" : "bg-amber/15 text-amber-700"}`}>{label}</span>; }
function DataChart({ title, values, empty, moneyValues = false }: { title: string; values: number[]; empty: string; moneyValues?: boolean }) { const max = Math.max(...values, 0); return <Panel title={title}>{max === 0 ? <EmptyState title="No data yet" body={empty} /> : <><div className="flex h-48 items-end gap-2 border-b border-l border-plum/10 px-4">{values.map((value, index) => <span key={index} title={moneyValues ? money(value) : String(value)} className="w-full rounded-t bg-magenta" style={{ height: `${Math.max(3, (value / max) * 100)}%` }} />)}</div><p className="mt-3 text-center text-xs text-ink/50">Last 14 days · database records only</p></>}</Panel>; }
function money(value: number) { return value.toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function minorMoney(value: number, currency: unknown) { try { return (Number(value || 0) / 100).toLocaleString("en-US", { style: "currency", currency: String(currency || "usd").toUpperCase() }); } catch { return `${String(currency || "usd").toUpperCase()} ${(Number(value || 0) / 100).toFixed(2)}`; } }
function date(value?: string) { return value ? new Date(value).toLocaleDateString() : "—"; }
function dateTime(value?: string, timeZone?: string) { return value ? new Date(value).toLocaleString("en-US", { timeZone: timeZone || "America/New_York", dateStyle: "medium", timeStyle: "short" }) : "—"; }
function subtitle(section: AdminSection) { return ({ overview: "Live platform records at a glance.", submissions: "Review salon applications organized by state.", salons: "Manage verification, status, plans, and marketplace profiles.", customers: "View and support Girlz Culture customers.", bookings: "Monitor and create bookings across the marketplace.", quality: "Protect service quality using verified review and complaint data.", reviews: "Moderate published, flagged, and disputed reviews.", finance: "Audit Stripe subscription invoices, plan changes, refunds, credits, and failures by state.", marketing: "Manage placements, promotions, and editorial content.", content: "Edit public pages, labels, images, policies, and blog posts.", support: "Manage customer support requests.", complaints: "Review and respond to customer complaints.", subscriptions: "Review plan tiers and Stripe subscription records.", engine: "Govern platform behavior, defaults, publication, and integration readiness.", settings: "Review platform configuration and authorized admin access." })[section]; }
