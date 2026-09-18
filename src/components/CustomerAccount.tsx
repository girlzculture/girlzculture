"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, CalendarDays, CreditCard, Crown, Heart, Home, MessageSquare, Search, Settings, Share2, ShoppingBag, Star, UserRound } from "lucide-react";
import { getSessionForScope, getSupabaseForScope } from "@/lib/supabase";
import SafeImage from "@/components/site/SafeImage";
import RoleLogoutButton, { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";
import { getSalonStatusLabel, isSalonClosedToday } from "@/lib/salonOpenStatus";
import BookingInbox from "@/components/BookingInbox";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import { readApiResponse } from "@/lib/apiResponseClient";
import WorkspaceToolbar from "@/components/dashboard/WorkspaceToolbar";
import CustomerAssistant from "@/components/dashboard/CustomerAssistant";
import WorkspaceCalendar from "@/components/dashboard/WorkspaceCalendar";

const supabase = getSupabaseForScope("customer");

type Row = Record<string, unknown> & {
  id?: string;
  status?: string;
  appointment_datetime?: string;
  salon?: Record<string, unknown>;
  style?: Record<string, unknown>;
  is_closed_override?: boolean | null;
  closed_override_date?: string | null;
  time_zone?: string | null;
  hours?: unknown;
};
type AccountTab = "overview" | "upcoming" | "past" | "orders" | "favorites" | "reviews" | "inbox" | "payments" | "settings";
const tabs: Array<[AccountTab, string, typeof Home]> = [
  ["overview", "Overview", Home], ["upcoming", "Upcoming Bookings", CalendarDays], ["past", "Past Bookings", CalendarDays],
  ["orders", "Product Orders", ShoppingBag],
  ["favorites", "Favorites", Heart], ["reviews", "Reviews", Star], ["inbox", "Inbox", MessageSquare],
  ["payments", "Payment Methods", CreditCard], ["settings", "Settings", Settings],
];

export default function CustomerAccount({discoveryAvailable=false,homeHref="/"}:{discoveryAvailable?:boolean;homeHref?:string}) {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab") as AccountTab | null;
  const tab = tabs.some(([id]) => id === requested) ? requested || "overview" : "overview";
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Row | null>(null);
  const [bookings, setBookings] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Row[]>([]);
  const [favorites, setFavorites] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const actor = useRef<string | null | undefined>(undefined);
  const generation = useRef(0);
  const [actorId, setActorId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const lifetime = generation;
    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      const nextActor = session?.user.id || null;
      if (nextActor === actor.current) return;
      actor.current = nextActor; lifetime.current++;
      setCustomer(null); setBookings([]); setOrders([]); setFavorites([]); setError("");
      setLoading(Boolean(nextActor)); setActorId(nextActor);
    });
    return () => { lifetime.current++; subscription.data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (actorId === undefined) return;
    if (!actorId) { router.replace("/login?next=/account"); return; }
    const identity = generation.current;
    let active = true;
    const current = () => active && identity === generation.current;
    // Session APIs run outside the auth callback to avoid holding its lock.
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!current()) return;
      if (!data.user || data.user.id !== actorId) {
        router.replace("/login?next=/account");
        return;
      }
      const session = await getSessionForScope("customer");
      if (!current()) return;
      if (!session || session.user.id !== data.user.id) {
        router.replace("/login?next=/account");
        return;
      }
      const [profileResult, bookingResult, favoriteResponse, orderResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", data.user.id).maybeSingle(),
        supabase.from("bookings").select("*,salon:salons(name,slug,address_city,address_state,cover_photo_url,time_zone),style:styles(name)").eq("customer_id", data.user.id).order("appointment_datetime", { ascending: false }).limit(100),
        fetch("/api/customer/favorites", { credentials: "same-origin", cache: "no-store", redirect: "manual", headers: { Accept: "application/json", Authorization: `Bearer ${session.access_token}` } }),
        supabase.from("product_orders").select("*,salon:salons(name,slug,cover_photo_url),items:product_order_items(product_name,quantity,line_total,image_url)").eq("customer_id", data.user.id).order("created_at", { ascending: false }).limit(100),
      ]);
      if (!current()) return;
      if (bookingResult.error || orderResult.error) throw new Error("Your bookings or orders could not be loaded. Please retry; no account data has been changed.");
      const favoriteBody = await readApiResponse(favoriteResponse, "Unable to load your saved salons.");
      if (!current()) return;
      if (!favoriteResponse.ok) throw new Error(favoriteBody.error || "Unable to load your saved salons.");
      if (profileResult.error) setError(profileResult.error.message);
      setCustomer((profileResult.data || { id: data.user.id, name: data.user.user_metadata?.name || data.user.email?.split("@")[0], email: data.user.email, membership_tier: "Member" }) as Row);
      setBookings((bookingResult.data || []) as Row[]);
      setFavorites((Array.isArray(favoriteBody.salons) ? favoriteBody.salons : []) as Row[]);
      setOrders((orderResult.data || []) as Row[]);
      setLoading(false);
    }).catch((loadError) => {
      if (current()) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load your account.");
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [router, actorId]);

  const [now] = useState(() => Date.now());
  const upcoming = useMemo(() => bookings.filter((booking) => new Date(String(booking.appointment_datetime || 0)).getTime() >= now && !["completed", "cancelled"].includes(String(booking.status || "").toLowerCase())), [bookings, now]);
  const past = useMemo(() => bookings.filter((booking) => new Date(String(booking.appointment_datetime || 0)).getTime() < now || ["completed", "cancelled"].includes(String(booking.status || "").toLowerCase())), [bookings, now]);

  if (loading || (!customer && !error)) return <main className="grid min-h-screen place-items-center bg-cream text-plum">Loading your beauty journey…</main>;
  if (error) return <main className="grid min-h-screen place-items-center bg-cream p-6"><div className="rounded-2xl bg-white p-8 text-center"><h1 className="font-serif text-3xl text-plum">Account unavailable</h1><p className="mt-3 text-sm gc-text-danger">{error}</p><Link href="/login" className="mt-5 inline-flex rounded-lg bg-magenta px-5 py-3 font-bold text-white">Sign in again</Link></div></main>;

  const name = String(customer?.name || "Girlz Culture Member");
  const firstName = name.split(" ")[0];
  return <div key={actorId} className="gc-dashboard min-h-screen bg-white pb-20 text-ink lg:pb-0"><RoleSessionBoundary scope="customer" />
    <header className="gc-brand-header flex min-h-20 flex-wrap gap-3 py-3 items-center justify-between border-b border-plum/10 px-5 lg:px-10">
      <Link href={homeHref} className="font-serif text-3xl font-bold text-plum">Girlz Culture</Link>
      <nav className="hidden gap-6 text-sm xl:flex"><Link href={homeHref}>Home</Link>{discoveryAvailable?<Link href="/salons">Search Salons</Link>:null}<Link href="/partner">For Professionals</Link><Link href="/how-it-works">Why Girlz Culture</Link></nav>
      <div data-language-selector-host className="flex items-center gap-2 sm:gap-4"><LanguageSelector compact/><Link href="/account?tab=upcoming" aria-label="Upcoming appointments" className="grid h-11 w-11 place-items-center"><Bell size={20}/></Link><Link href="/account?tab=inbox" aria-label="Booking messages" className="grid h-11 w-11 place-items-center"><MessageSquare size={20}/></Link><span data-no-translate className="hidden font-semibold sm:block">{firstName}</span><RoleLogoutButton scope="customer" compact className="flex h-10 w-10 items-center justify-center rounded-full text-plum hover:bg-blush lg:hidden" /></div>
    </header>
    <div className="mx-auto grid max-w-[1720px] lg:grid-cols-[270px_1fr]">
      <aside className="gc-workspace-sidebar hidden min-h-[calc(100vh-80px)] p-6 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-4"><SafeImage src={customer?.avatar_url as string} fallbackSrc="/images/braids-knotless.jpg" alt={name} className="h-20 w-20 rounded-full object-cover"/><div><h2 data-no-translate className="font-serif text-xl">{name}</h2><p className="mt-1 flex items-center gap-1.5 text-sm text-amber"><Crown size={15} aria-hidden="true" />{String(customer?.membership_tier || "Member")}</p></div></div>
        <nav className="mt-7 space-y-2">{tabs.map(([id, label, Icon]) => <Link key={id} href={`/account?tab=${id}`} aria-current={tab === id ? "page" : undefined} className={`flex items-center gap-3 rounded-[10px] px-4 py-3 text-sm ${tab === id ? "bg-magenta/55" : "hover:bg-white/10"}`}><Icon size={20}/>{label}</Link>)}</nav>
        <RoleLogoutButton scope="customer" className="mt-auto flex items-center gap-3 rounded-[10px] px-4 py-3 hover:bg-white/10" />
      </aside>
      <main className="min-w-0 p-4 sm:p-8 lg:p-10">
        <WorkspaceToolbar homeHref="/account" homeLabel="Overview" current={tabs.find(([id]) => id === tab)?.[1] || "Overview"} destinations={tabs.map(([id, label]) => ({ label, href: `/account?tab=${id}` }))}/>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Link href="/account/waitlist" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Appointment waitlist</Link><CustomerAssistant upcomingCount={upcoming.length}/></div>
        <section className="rounded-[18px] bg-plum p-6 text-white lg:bg-transparent lg:p-0 lg:text-ink"><p className="text-sm lg:hidden">Welcome back,</p><h1 className="font-serif text-3xl font-semibold lg:text-4xl lg:text-plum">{tab === "overview" ? `Welcome back, ${firstName}!` : tabs.find(([id]) => id === tab)?.[1]}</h1><p className="mt-2 text-sm text-text-on-dark-muted lg:text-text-secondary">Manage your bookings, favorites, reviews, and account details.</p></section>
        <div className="mt-7">{tab === "overview" ? <Overview discoveryAvailable={discoveryAvailable} upcoming={upcoming} past={past} favorites={favorites}/> : tab === "upcoming" ? <BookingPanel title="Upcoming Bookings" rows={upcoming} empty="No upcoming appointments yet." full/> : tab === "past" || tab === "reviews" ? <BookingPanel title={tab === "reviews" ? "Appointments ready for a review" : "Past Bookings"} rows={tab === "reviews" ? past.filter(row => String(row.status).toLowerCase() === "completed") : past} empty="No completed appointments yet." past full/> : tab === "orders" ? <OrderPanel discoveryAvailable={discoveryAvailable} rows={orders}/> : tab === "favorites" ? <FavoritePanel discoveryAvailable={discoveryAvailable} favorites={favorites}/> : tab === "inbox" ? <BookingInbox scope="customer" initialBookingId={params.get("booking") || ""}/> : tab === "payments" ? <EmptyState title="Payment methods" text="Reservation deposits and product purchases are paid securely in Stripe Checkout. Girlz Culture does not store card numbers." action={discoveryAvailable?"Browse salons":"Your appointments"} href={discoveryAvailable?"/salons":"/account?tab=upcoming"}/> : <SettingsPanel customer={customer}/>}</div>
      </main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-plum/10 bg-white p-2 lg:hidden">{[[Home, "Home", "/"], [Search, "Search", "/salons"], [CalendarDays, "Bookings", "/account?tab=upcoming"], [Share2, "Social", "/social"], [UserRound, "Profile", "/account?tab=settings"]].map(([Icon, label, href]) => <Link key={label as string} href={href as string} className="flex flex-col items-center gap-1 text-[10px]"><Icon size={21}/>{label as string}</Link>)}</nav>
  </div>;
}

function Overview({ upcoming, past, favorites, discoveryAvailable }: { upcoming: Row[]; past: Row[]; favorites: Row[]; discoveryAvailable:boolean }) {
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3">{[["Upcoming appointments", upcoming.length], ["Past appointments", past.length], ["Saved businesses", favorites.length]].map(([label, value]) => <article className="gc-stat" key={label}><p>{label}</p><strong>{value}</strong></article>)}</div><p className="text-xs">Counts reflect your loaded account records. No demonstration figures are included.</p><div className="grid gap-5 xl:grid-cols-2"><BookingPanel title="Upcoming Bookings" rows={upcoming.slice(0, 2)} empty="No upcoming appointments yet."/><BookingPanel title="Past Bookings" rows={past.slice(0, 2)} empty="No past appointments yet." past/></div><FavoritePanel discoveryAvailable={discoveryAvailable} favorites={favorites}/></div>;
}

function BookingPanel({ title, rows, empty, past = false, full = false }: { title: string; rows: Row[]; empty: string; past?: boolean; full?: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const statuses = [...new Set(rows.map(row => String(row.status || "Pending")))].sort();
  const visible = rows.filter(row => {
    const day = String(row.appointment_datetime || "").slice(0, 10);
    return (!query || [row.salon?.name, row.style?.name, row.public_reference].some(value => String(value || "").toLowerCase().includes(query.trim().toLowerCase()))) && (status === "all" || row.status === status) && (!from || day >= from) && (!through || day <= through);
  });
  const timeZone = String(rows[0]?.salon?.time_zone || "UTC");
  return <div className="space-y-6">
    {full ? <section className="gc-panel"><h2 className="text-lg">Find an appointment</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold">Search<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Business, service or reference" className="mt-1 min-h-11 w-full rounded-lg border px-3"/></label><label className="text-sm font-semibold">Status<select value={status} onChange={event => setStatus(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3"><option value="all">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-semibold">From (UTC)<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"/></label><label className="text-sm font-semibold">Through (UTC)<input type="date" value={through} min={from} onChange={event => setThrough(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"/></label></div></section> : null}
    {full && !past ? <WorkspaceCalendar initialView="month" timeZone={timeZone} title="Your appointment calendar" events={visible.map(row => ({ id: String(row.id), start: String(row.appointment_datetime), title: String(row.style?.name || "Appointment"), subtitle: String(row.salon?.name || "Business"), status: row.status, href: `/account?tab=inbox&booking=${row.id}` }))}/> : null}
    <section className="gc-panel"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl">{title}</h2>{!full ? <Link href={`/account?tab=${past ? "past" : "upcoming"}`} className="text-sm font-bold text-magenta">View all →</Link> : <span className="text-sm">{visible.length} matching appointments</span>}</div>
    <div className="mt-4 divide-y divide-border">{visible.map(booking => <article key={booking.id} className="flex flex-wrap items-start gap-3 py-5"><SafeImage src={booking.salon?.cover_photo_url as string} fallbackSrc="/images/salon-warm.jpg" alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover"/><div className="min-w-0 flex-1"><h3 data-no-translate className="text-base font-bold">{String(booking.salon?.name || "Business")}</h3><p data-no-translate className="mt-1 text-sm">{String(booking.style?.name || "Appointment")}</p><p className="mt-1 text-sm">{formatDate(booking.appointment_datetime, booking.salon?.time_zone)}</p><p className="mt-1 text-xs">{String(booking.salon?.time_zone || "UTC")}</p></div><div className="ml-auto flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end"><Status value={booking.status}/><div className="flex flex-wrap gap-3">{past && String(booking.status).toLowerCase() === "completed" ? <Link href={`/review/${booking.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-magenta px-3 text-sm font-bold text-magenta">Leave Review</Link> : null}<Link href={`/account?tab=inbox&booking=${booking.id}`} className="inline-flex min-h-10 items-center text-sm font-bold text-magenta">Details & messages</Link>{booking.salon?.slug ? <Link href={`/salon/${booking.salon.slug}`} className="inline-flex min-h-10 items-center text-sm font-bold text-magenta">View business</Link> : null}</div></div></article>)}{!visible.length ? <p className="py-10 text-center text-sm">{rows.length ? "No appointments match these filters." : empty}</p> : null}</div></section>
  </div>;
}

function OrderPanel({ rows, discoveryAvailable }: { rows: Row[]; discoveryAvailable:boolean }) {
  return (
    <section className="rounded-[18px] border border-plum/10 bg-white/75 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-plum">
            Product Orders
          </h2>
          <p className="mt-1 text-sm text-ink/55">
            Pickup, shipping, payment, and tracking details from your salons.
          </p>
        </div>
        {discoveryAvailable?<Link href="/salons" className="text-sm font-bold text-magenta">
          Shop salons
        </Link>:null}
      </div>
      <div className="mt-5 space-y-4">
        {rows.map((order) => {
          const salon = (order.salon || {}) as Row;
          const items = Array.isArray(order.items) ? (order.items as Row[]) : [];
          return (
            <article
              key={String(order.id)}
              className="rounded-[14px] border border-plum/10 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <SafeImage
                    src={String(salon.cover_photo_url || "")}
                    fallbackSrc="/images/salon-warm.jpg"
                    alt={String(salon.name || "Salon")}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                  <div>
                    <h3 className="font-serif font-semibold text-plum">
                      {String(salon.name || "Girlz Culture Salon")}
                    </h3>
                    <p className="mt-1 text-[11px] text-ink/55">
                      {String(order.public_reference)} ·{" "}
                      {String(order.fulfillment_method)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <b>${Number(order.total_amount || 0).toFixed(2)}</b>
                  <p className="mt-1 text-[10px] font-bold text-magenta">
                    {String(order.fulfillment_status || "New")}
                  </p>
                </div>
              </div>
              <div className="mt-4 divide-y divide-plum/10 rounded-lg bg-blush/20 px-3">
                {items.map((item, index) => (
                  <p
                    key={`${String(item.product_name)}-${index}`}
                    className="flex justify-between gap-4 py-2 text-xs"
                  >
                    <span>
                      {String(item.quantity)} × {String(item.product_name)}
                    </span>
                    <span>${Number(item.line_total || 0).toFixed(2)}</span>
                  </p>
                ))}
              </div>
              {order.tracking_number ? (
                <p className="mt-3 text-xs">
                  {String(order.carrier || "Carrier")} tracking:{" "}
                  <b>{String(order.tracking_number)}</b>
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
                {salon.slug ? (
                  <Link
                    href={`/salon/${String(salon.slug)}`}
                    className="font-bold text-magenta"
                  >
                    View salon
                  </Link>
                ) : null}
                {order.stripe_receipt_url ? (
                  <a
                    href={String(order.stripe_receipt_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-plum"
                  >
                    Payment receipt
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
        {!rows.length ? (
          <p className="py-10 text-center text-sm text-ink/50">
            You have no product orders yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FavoritePanel({ favorites, discoveryAvailable }: { favorites: Row[]; discoveryAvailable:boolean }) {
  return <section className="rounded-[18px] border border-plum/10 bg-white/75 p-5"><div className="flex justify-between"><div><h2 className="font-serif text-2xl font-semibold text-plum">Your Favorite Salons</h2><p className="text-sm text-ink/60">Quick access to the salons you love.</p></div>{discoveryAvailable?<Link href="/salons" className="text-sm font-bold text-magenta">Find salons</Link>:null}</div><div className="mt-5 flex gap-4 overflow-x-auto">{favorites.map((salon) => { const reviews = Number(salon.review_count || 0); const closed=isSalonClosedToday(salon); return <article key={salon.id} className="min-w-56 overflow-hidden rounded-[14px] border border-plum/10 bg-white"><SafeImage src={salon.cover_photo_url as string} fallbackSrc="/images/salon-warm.jpg" alt={String(salon.name)} className="h-28 w-full object-cover"/><div className="p-3"><h3 className="font-serif font-semibold">{String(salon.name)}</h3><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-bold ${closed?"bg-red-100 gc-text-danger":"bg-blush/55 text-plum"}`}>{getSalonStatusLabel(salon)}</span>{reviews > 0 ? <p className="mt-1 flex items-center gap-1 text-xs text-amber"><Star size={13} className="fill-amber" aria-hidden="true"/>{Number(salon.rating_overall || 0).toFixed(1)} ({reviews})</p> : <span className="mt-1 inline-flex rounded-full bg-blush px-2 py-1 text-xs font-bold text-plum">New</span>}<Link href={`/salon/${salon.slug}`} className="mt-3 block rounded-lg border border-magenta py-2 text-center text-xs font-bold text-magenta">View salon</Link></div></article>; })}{!favorites.length ? <p className="py-10 text-sm text-ink/50">Save salons with the heart button to see them here.</p> : null}</div></section>;
}

function EmptyState({ title, text, action, href }: { title: string; text: string; action: string; href: string }) {
  return <section className="rounded-[18px] border border-plum/10 bg-white/75 p-10 text-center"><h2 className="font-serif text-3xl text-plum">{title}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-ink/60">{text}</p><Link href={href} className="mt-6 inline-flex rounded-lg bg-magenta px-5 py-3 text-sm font-bold text-white">{action}</Link></section>;
}

function SettingsPanel({ customer }: { customer: Row | null }) {
  const [mfa, setMfa] = useState(false);
  const [securityMessage, setSecurityMessage] = useState("");
  useEffect(() => { void supabase.auth.getSession().then(async ({ data }) => {
    if (!data.session) return;
    const response = await fetch("/api/auth/mfa/settings", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    if (response.ok) { const body = await response.json(); setMfa(Boolean(body.mfa_enabled)); }
  }); }, []);
  async function saveMfa(enabled: boolean) {
    setSecurityMessage("");
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setSecurityMessage("Sign in again to change security settings."); return; }
    const response = await fetch("/api/auth/mfa/settings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ mfa_enabled: enabled, preferred_channel: "email" }) });
    const body = await response.json();
    if (!response.ok) { setSecurityMessage(body.error || "Unable to save 2FA."); return; }
    setMfa(enabled); setSecurityMessage(enabled ? "Email two-factor authentication is now enabled." : "Two-factor authentication is now optional for this customer account.");
  }
  return <section className="rounded-[18px] border border-plum/10 bg-white/75 p-6"><h2 className="font-serif text-2xl text-plum">Profile settings</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Name<input readOnly value={String(customer?.name || "")} className="mt-2 w-full rounded-lg border border-plum/10 bg-cream/40 p-3 font-normal"/></label><label className="text-sm font-bold">Email<input readOnly value={String(customer?.email || "")} className="mt-2 w-full rounded-lg border border-plum/10 bg-cream/40 p-3 font-normal"/></label></div><div className="mt-6 rounded-[12px] border border-magenta/20 bg-blush/20 p-4"><div className="flex items-center justify-between gap-4"><div><h3 className="font-semibold text-plum">Email two-factor authentication</h3><p className="mt-1 text-sm leading-6 gc-text-primary">Optional for customers. When enabled, every new sign-in requires a six-digit email code.</p></div><input type="checkbox" checked={mfa} onChange={(event) => void saveMfa(event.target.checked)} className="h-5 w-5 accent-magenta" aria-label="Enable email two-factor authentication" /></div>{securityMessage ? <p className="mt-3 text-sm text-plum">{securityMessage}</p> : null}</div><div className="mt-5 flex flex-wrap gap-5"><Link href="/forgot-password" className="inline-flex text-sm font-bold text-magenta">Reset password</Link><RoleLogoutButton scope="customer" className="flex items-center gap-2 text-sm font-bold text-magenta" /></div></section>;
}

function Status({ value }: { value?: string }) {
  const label = value || "Not recorded";
  const color = /completed|confirmed/i.test(label) ? "bg-green-50 gc-text-success" : /cancel/i.test(label) ? "bg-red-50 gc-text-danger" : "bg-amber/15 gc-text-warning";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${color}`}>{label}</span>;
}

function formatDate(value?: string, timeZone?: unknown) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not recorded" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: String(timeZone || "America/New_York") });
}
