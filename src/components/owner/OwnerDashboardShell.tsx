"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, CircleDollarSign, Crown, ExternalLink, Home, Images, Menu, Megaphone, MessageSquare, Package, Scissors, Settings, Star, UserRound, UsersRound } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import RoleLogoutButton, { RoleSessionBoundary } from "@/components/auth/RoleLogoutButton";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import DashboardNotificationCenter, { type DashboardNotification } from "@/components/notifications/DashboardNotificationCenter";

export type DashboardSection = "overview" | "my-page" | "photos" | "styles" | "stylists" | "products" | "availability" | "bookings" | "messages" | "reviews" | "earnings" | "promotions" | "subscription" | "settings";

const nav = [
  ["overview", "Overview", Home], ["my-page", "My Page", UserRound], ["photos", "Photos", Images], ["styles", "Styles & Pricing", Scissors], ["stylists", "Stylists", UsersRound], ["products", "Products", Package], ["availability", "Availability & Calendar", CalendarDays], ["bookings", "Bookings", CalendarDays], ["messages", "Messages", MessageSquare], ["reviews", "Reviews", Star], ["earnings", "Earnings & Payouts", CircleDollarSign], ["promotions", "Promotions", Megaphone], ["subscription", "Subscription", Crown], ["settings", "Settings", Settings],
] as const;

const hrefFor = (section: string) => section === "overview" ? "/salon/dashboard" : `/salon/dashboard/${section}`;

export default function OwnerDashboardShell({ children, section, salonName, salonSlug, avatar, notifications = [], access = null }: { children: React.ReactNode; section: DashboardSection; salonName: string; salonSlug: string; avatar?: string | null; notifications?: DashboardNotification[]; access?: Record<string,boolean>|null }) {
  const [notificationCounts, setNotificationCounts] = useState<Record<string,number>>({});
  const handleNotificationCounts = useCallback((counts:Record<string,number>) => setNotificationCounts(counts),[]);
  const canAccess = (id: string) => access === null || (id !== "subscription" && Boolean(access[id === "messages" ? "bookings" : id.replace("-", "_")]));
  const visibleNav = nav.filter(([id]) => canAccess(id));
  const homeHref = visibleNav.length ? hrefFor(visibleNav[0][0]) : "/salon/login";
  const mobileNav = ([
    ["overview","Overview",Home], ["bookings","Bookings",CalendarDays], ["availability","Calendar",CalendarDays], ["messages","Messages",MessageSquare], ["settings","More",Menu],
  ] as const).filter(([id]) => canAccess(id));
  const navBadge = (id:string) => id === "bookings"
    ? Number(notificationCounts.bookings || 0)
    : id === "messages"
      ? Number(notificationCounts.messages || 0)
      : id === "earnings" || id === "subscription"
        ? Number(notificationCounts.payments || 0)
        : id === "settings"
          ? Number(notificationCounts.errors || 0) + Number(notificationCounts.support || 0)
          : 0;
  return <div className="min-h-screen bg-cream text-ink lg:grid lg:grid-cols-[220px_minmax(0,1fr)]"><RoleSessionBoundary scope="salon" />
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[220px] overflow-y-auto bg-[radial-gradient(circle_at_60%_20%,#6b176f,#2b0835_70%)] px-4 py-5 text-white lg:block">
      <Link href={homeHref} className="block px-3 font-serif text-[31px] font-bold leading-none">Girlz<span className="block pl-1 text-[10px] uppercase tracking-[0.35em] text-amber">Culture</span></Link>
      <nav aria-label="Salon owner navigation" className="mt-7 space-y-1">{visibleNav.map(([id,label,Icon]) => { const active=section===id; const count=navBadge(id); return <Link key={id} href={hrefFor(id)} aria-current={active?"page":undefined} className={`flex min-h-10 items-center gap-3 rounded-[9px] px-3 text-[12px] font-medium transition ${active?"bg-magenta/70 text-white shadow-[0_8px_24px_rgba(214,24,107,.2)]":"text-white/85 hover:bg-white/10"}`}><Icon size={18} strokeWidth={1.7}/>{label}{count?<span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-magenta">{Math.min(count,99)}</span>:null}</Link>; })}</nav>
      {canAccess("promotions") ? <div className="mt-7 overflow-hidden rounded-[12px] border border-white/15 bg-white/5 p-4"><p className="font-serif text-base">Grow your brand<br />with Girlz Culture</p><p className="mt-3 text-[10px] leading-4 text-white/70">Reach more clients and build your beauty empire.</p><div className="mt-4 h-28 rounded-[10px] bg-[url('/images/hero-braids.jpg')] bg-cover bg-[center_20%]" /><Link href="/salon/dashboard/promotions" className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-[#ff68aa]">Learn more →</Link></div> : null}
      <RoleLogoutButton scope="salon" className="mt-5 flex w-full items-center gap-3 rounded-[9px] px-3 py-3 text-sm text-white/85 hover:bg-white/10" />
    </aside>
    <div className="min-w-0 lg:col-start-2">
      <header className="sticky top-0 z-40 flex h-[74px] items-center justify-between border-b border-plum/10 bg-[#fffdfa]/95 px-4 backdrop-blur lg:px-8">
        <details className="relative lg:hidden"><summary aria-label="Open owner navigation" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden"><Menu size={24}/></summary><nav className="absolute left-0 top-12 w-72 rounded-[14px] border border-plum/10 bg-white p-2 shadow-2xl">{visibleNav.map(([id,label,Icon])=><Link key={id} href={hrefFor(id)} className={`flex items-center gap-3 rounded-[9px] px-3 py-3 text-sm ${section===id?"bg-blush text-magenta":""}`}><Icon size={18}/>{label}</Link>)}</nav></details>
        <Link href={homeHref} className="font-serif text-[27px] font-bold text-plum lg:block">Girlz<span className="ml-1 text-[9px] uppercase tracking-[0.22em] text-amber">Culture</span></Link>
        <LanguageSelector compact className="ml-auto mr-2 sm:mr-4" />
        <div className="flex items-center gap-2 sm:gap-4"><Link href={`/salon/${salonSlug}`} className="hidden items-center gap-1 text-xs font-semibold text-plum sm:inline-flex">View Public Page <ExternalLink size={14}/></Link><DashboardNotificationCenter scope="salon" initialNotifications={notifications} onCounts={handleNotificationCounts}/><div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-blush text-plum">{avatar?<SafeImage src={avatar} fallbackSrc={avatar} alt={`${salonName} logo`} className="h-full w-full object-cover" />:<UserRound size={19}/>}</div><span className="hidden max-w-44 truncate text-xs font-semibold sm:block">{salonName}</span><ChevronDown size={16} className="hidden sm:block" /></div>
      </header>
      <main className="min-w-0 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
    </div>
    <nav aria-label="Owner mobile navigation" className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-plum/10 bg-white/95 px-1 pb-[max(7px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(26,18,32,.08)] backdrop-blur lg:hidden">{mobileNav.map(([id,label,Icon])=>{const active=section===id||(id==="settings"&&!['overview','bookings','availability','messages'].includes(section));return <Link key={id} href={hrefFor(id)} className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[9px] font-semibold ${active?"text-magenta":"text-ink/70"}`}><Icon size={19}/>{label}</Link>;})}</nav>
  </div>;
}
