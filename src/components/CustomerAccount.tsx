"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, CalendarDays, CreditCard, Crown, Heart, Home, MessageSquare, Search, Settings, Share2, Star, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SafeImage from "@/components/site/SafeImage";
import RoleLogoutButton, { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";
import { getSalonStatusLabel, isSalonClosedToday } from "@/lib/salonOpenStatus";
import BookingInbox from "@/components/BookingInbox";
import LanguageSelector from "@/components/i18n/LanguageSelector";

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
type AccountTab = "overview" | "upcoming" | "past" | "favorites" | "reviews" | "inbox" | "payments" | "settings";
const tabs: Array<[AccountTab, string, typeof Home]> = [
  ["overview", "Overview", Home], ["upcoming", "Upcoming Bookings", CalendarDays], ["past", "Past Bookings", CalendarDays],
  ["favorites", "Favorites", Heart], ["reviews", "Reviews", Star], ["inbox", "Inbox", MessageSquare],
  ["payments", "Payment Methods", CreditCard], ["settings", "Settings", Settings],
];

export default function CustomerAccount() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab") as AccountTab | null;
  const tab = tabs.some(([id]) => id === requested) ? requested || "overview" : "overview";
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Row | null>(null);
  const [bookings, setBookings] = useState<Row[]>([]);
  const [favorites, setFavorites] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/login?next=/account");
        return;
      }
      const [profileResult, bookingResult, favoriteResult] = await Promise.all([
        supabase.from("customers").select("*").eq("id", data.user.id).maybeSingle(),
        supabase.from("bookings").select("*,salon:salons(name,slug,address_city,address_state,cover_photo_url,time_zone),style:styles(name)").eq("customer_id", data.user.id).order("appointment_datetime", { ascending: false }).limit(100),
        supabase.from("customer_favorites").select("salon:salons(*)").eq("customer_id", data.user.id).limit(50),
      ]);
      if (!active) return;
      if (profileResult.error) setError(profileResult.error.message);
      setCustomer((profileResult.data || { id: data.user.id, name: data.user.user_metadata?.name || data.user.email?.split("@")[0], email: data.user.email, membership_tier: "Member" }) as Row);
      setBookings((bookingResult.data || []) as Row[]);
      setFavorites((favoriteResult.data || []).map((item) => item.salon as unknown as Row).filter(Boolean));
      setLoading(false);
    }).catch((loadError) => {
      if (active) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load your account.");
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [router]);

  const [now] = useState(() => Date.now());
  const upcoming = useMemo(() => bookings.filter((booking) => new Date(String(booking.appointment_datetime || 0)).getTime() >= now && !["completed", "cancelled"].includes(String(booking.status || "").toLowerCase())), [bookings, now]);
  const past = useMemo(() => bookings.filter((booking) => new Date(String(booking.appointment_datetime || 0)).getTime() < now || ["completed", "cancelled"].includes(String(booking.status || "").toLowerCase())), [bookings, now]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-cream text-plum">Loading your beauty journey…</main>;
  if (error) return <main className="grid min-h-screen place-items-center bg-cream p-6"><div className="rounded-2xl bg-white p-8 text-center"><h1 className="font-serif text-3xl text-plum">Account unavailable</h1><p className="mt-3 text-sm text-red-700">{error}</p><Link href="/login" className="mt-5 inline-flex rounded-lg bg-magenta px-5 py-3 font-bold text-white">Sign in again</Link></div></main>;

  const name = String(customer?.name || "Girlz Culture Member");
  const firstName = name.split(" ")[0];
  return <div className="min-h-screen bg-cream pb-20 text-ink lg:pb-0"><RoleSessionBoundary scope="customer" />
    <header className="flex h-20 items-center justify-between border-b border-plum/10 bg-white/80 px-5 lg:px-10">
      <Link href="/" className="font-serif text-3xl font-bold text-plum">Girlz Culture</Link>
      <nav className="hidden gap-10 text-sm md:flex"><Link href="/">Home</Link><Link href="/salons">Search Salons</Link><Link href="/partner">For Professionals</Link><Link href="/how-it-works">Why Girlz Culture</Link></nav>
      <div data-language-selector-host className="flex items-center gap-2 sm:gap-4"><LanguageSelector compact/><Bell /><MessageSquare /><span className="hidden font-semibold sm:block">{firstName}</span><RoleLogoutButton scope="customer" compact className="flex h-10 w-10 items-center justify-center rounded-full text-plum hover:bg-blush lg:hidden" /></div>
    </header>
    <div className="mx-auto grid max-w-[1720px] lg:grid-cols-[270px_1fr]">
      <aside className="hidden min-h-[calc(100vh-80px)] bg-[linear-gradient(150deg,#4b0b58,#22092b)] p-6 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-4"><SafeImage src={customer?.avatar_url as string} fallbackSrc="/images/braids-knotless.jpg" alt={name} className="h-20 w-20 rounded-full object-cover"/><div><h2 className="font-serif text-xl">{name}</h2><p className="mt-1 flex items-center gap-1.5 text-sm text-amber"><Crown size={15} aria-hidden="true" />{String(customer?.membership_tier || "Member")}</p></div></div>
        <nav className="mt-7 space-y-2">{tabs.map(([id, label, Icon]) => <Link key={id} href={`/account?tab=${id}`} className={`flex items-center gap-3 rounded-[10px] px-4 py-3 text-sm ${tab === id ? "bg-magenta/55" : "hover:bg-white/10"}`}><Icon size={20}/>{label}</Link>)}</nav>
        <RoleLogoutButton scope="customer" className="mt-auto flex items-center gap-3 rounded-[10px] px-4 py-3 hover:bg-white/10" />
      </aside>
      <main className="min-w-0 p-4 sm:p-8 lg:p-10">
        <section className="rounded-[18px] bg-plum p-6 text-white lg:bg-transparent lg:p-0 lg:text-ink"><p className="text-sm lg:hidden">Welcome back,</p><h1 className="font-serif text-3xl font-semibold lg:text-4xl lg:text-plum">{tab === "overview" ? `Welcome back, ${firstName}!` : tabs.find(([id]) => id === tab)?.[1]}</h1><p className="mt-2 text-sm opacity-70">Manage your bookings, favorites, reviews, and account details.</p></section>
        <div className="mt-7">{tab === "overview" ? <Overview upcoming={upcoming} past={past} favorites={favorites}/> : tab === "upcoming" ? <BookingPanel title="Upcoming Bookings" rows={upcoming} empty="No upcoming appointments yet."/> : tab === "past" || tab === "reviews" ? <BookingPanel title={tab === "reviews" ? "Appointments ready for a review" : "Past Bookings"} rows={past} empty="No completed appointments yet." past/> : tab === "favorites" ? <FavoritePanel favorites={favorites}/> : tab === "inbox" ? <BookingInbox scope="customer"/> : tab === "payments" ? <EmptyState title="Payment methods" text="Reservation deposits are paid securely in Stripe Checkout. Girlz Culture does not store card numbers." action="Browse salons" href="/salons"/> : <SettingsPanel customer={customer}/>}</div>
      </main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-plum/10 bg-white p-2 lg:hidden">{[[Home, "Home", "/"], [Search, "Search", "/salons"], [CalendarDays, "Bookings", "/account?tab=upcoming"], [Share2, "Social", "/social"], [UserRound, "Profile", "/account?tab=inbox"]].map(([Icon, label, href]) => <Link key={label as string} href={href as string} className="flex flex-col items-center gap-1 text-[10px]"><Icon size={21}/>{label as string}</Link>)}</nav>
  </div>;
}

function Overview({ upcoming, past, favorites }: { upcoming: Row[]; past: Row[]; favorites: Row[] }) {
  return <><div className="grid gap-5 xl:grid-cols-2"><BookingPanel title="Upcoming Bookings" rows={upcoming.slice(0, 2)} empty="No upcoming appointments yet."/><BookingPanel title="Past Bookings" rows={past.slice(0, 2)} empty="No past appointments yet." past/></div><div className="mt-6"><FavoritePanel favorites={favorites}/></div></>;
}

function BookingPanel({ title, rows, empty, past = false }: { title: string; rows: Row[]; empty: string; past?: boolean }) {
  return <section className="rounded-[18px] border border-plum/10 bg-white/75 p-5"><div className="flex justify-between"><h2 className="font-serif text-2xl font-semibold text-plum">{title}</h2><Link href={`/account?tab=${past ? "past" : "upcoming"}`} className="text-sm font-bold text-magenta">View all</Link></div><div className="mt-4 divide-y divide-plum/10">{rows.map((booking) => <article key={booking.id} className="grid grid-cols-[74px_1fr_auto] gap-3 py-4"><SafeImage src={booking.salon?.cover_photo_url as string} fallbackSrc="/images/salon-warm.jpg" alt={String(booking.salon?.name || "Salon")} className="h-16 w-[74px] rounded-lg object-cover"/><div><h3 className="font-serif font-semibold">{String(booking.salon?.name || "Girlz Culture Salon")}</h3><p className="mt-1 text-xs text-ink/60">{String(booking.style?.name || "Braiding appointment")}</p><p className="mt-1 text-[11px]">{formatDate(booking.appointment_datetime, booking.salon?.time_zone)}</p></div><div className="text-right"><Status value={booking.status}/>{past && String(booking.status).toLowerCase() === "completed" ? <Link href={`/review/${booking.id}`} className="mt-3 block rounded-lg border border-magenta px-3 py-2 text-[10px] font-bold text-magenta">Leave Review</Link> : <Link href={`/salon/${booking.salon?.slug}`} className="mt-3 block text-[10px] font-bold text-magenta">View salon</Link>}</div></article>)}{!rows.length ? <p className="py-10 text-center text-sm text-ink/50">{empty}</p> : null}</div></section>;
}

function FavoritePanel({ favorites }: { favorites: Row[] }) {
  return <section className="rounded-[18px] border border-plum/10 bg-white/75 p-5"><div className="flex justify-between"><div><h2 className="font-serif text-2xl font-semibold text-plum">Your Favorite Salons</h2><p className="text-sm text-ink/60">Quick access to the salons you love.</p></div><Link href="/salons" className="text-sm font-bold text-magenta">Find salons</Link></div><div className="mt-5 flex gap-4 overflow-x-auto">{favorites.map((salon) => { const reviews = Number(salon.review_count || 0); const closed=isSalonClosedToday(salon); return <article key={salon.id} className="min-w-56 overflow-hidden rounded-[14px] border border-plum/10 bg-white"><SafeImage src={salon.cover_photo_url as string} fallbackSrc="/images/salon-warm.jpg" alt={String(salon.name)} className="h-28 w-full object-cover"/><div className="p-3"><h3 className="font-serif font-semibold">{String(salon.name)}</h3><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-bold ${closed?"bg-red-100 text-red-700":"bg-blush/55 text-plum"}`}>{getSalonStatusLabel(salon)}</span>{reviews > 0 ? <p className="mt-1 flex items-center gap-1 text-xs text-amber"><Star size={13} className="fill-amber" aria-hidden="true"/>{Number(salon.rating_overall || 0).toFixed(1)} ({reviews})</p> : <span className="mt-1 inline-flex rounded-full bg-blush px-2 py-1 text-xs font-bold text-plum">New</span>}<Link href={`/salon/${salon.slug}`} className="mt-3 block rounded-lg border border-magenta py-2 text-center text-xs font-bold text-magenta">View salon</Link></div></article>; })}{!favorites.length ? <p className="py-10 text-sm text-ink/50">Save salons with the heart button to see them here.</p> : null}</div></section>;
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
  return <section className="rounded-[18px] border border-plum/10 bg-white/75 p-6"><h2 className="font-serif text-2xl text-plum">Profile settings</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Name<input readOnly value={String(customer?.name || "")} className="mt-2 w-full rounded-lg border border-plum/10 bg-cream/40 p-3 font-normal"/></label><label className="text-sm font-bold">Email<input readOnly value={String(customer?.email || "")} className="mt-2 w-full rounded-lg border border-plum/10 bg-cream/40 p-3 font-normal"/></label></div><div className="mt-6 rounded-[12px] border border-magenta/20 bg-blush/20 p-4"><div className="flex items-center justify-between gap-4"><div><h3 className="font-semibold text-plum">Email two-factor authentication</h3><p className="mt-1 text-sm leading-6 text-ink/70">Optional for customers. When enabled, every new sign-in requires a six-digit email code.</p></div><input type="checkbox" checked={mfa} onChange={(event) => void saveMfa(event.target.checked)} className="h-5 w-5 accent-magenta" aria-label="Enable email two-factor authentication" /></div>{securityMessage ? <p className="mt-3 text-sm text-plum">{securityMessage}</p> : null}</div><div className="mt-5 flex flex-wrap gap-5"><Link href="/forgot-password" className="inline-flex text-sm font-bold text-magenta">Reset password</Link><RoleLogoutButton scope="customer" className="flex items-center gap-2 text-sm font-bold text-magenta" /></div></section>;
}

function Status({ value }: { value?: string }) {
  const label = value || "Not recorded";
  const color = /completed|confirmed/i.test(label) ? "bg-green-50 text-green-700" : /cancel/i.test(label) ? "bg-red-50 text-red-700" : "bg-amber/15 text-[#8b5b12]";
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${color}`}>{label}</span>;
}

function formatDate(value?: string, timeZone?: unknown) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not recorded" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: String(timeZone || "America/New_York") });
}
