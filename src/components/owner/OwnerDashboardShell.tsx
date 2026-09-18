"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Crown,
  ExternalLink,
  Home,
  Images,
  Menu,
  Megaphone,
  MessageSquare,
  Package,
  Scissors,
  Settings,
  Star,
  UserRound,
  UsersRound,
} from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import RoleLogoutButton, {
  RoleSessionBoundary,
} from "@/components/auth/RoleLogoutButton";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import { GcAssistantLauncher, useAssistantDocked } from "@/components/owner/GcAssistant";
import DashboardNotificationCenter, {
  type DashboardNotification,
} from "@/components/notifications/DashboardNotificationCenter";
import DashboardMobileMenu from "@/components/dashboard/DashboardMobileMenu";
import OwnerRealtimeAlertBridge from "@/components/owner/OwnerRealtimeAlertBridge";
import WorkspaceToolbar from "@/components/dashboard/WorkspaceToolbar";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";

export type DashboardSection =
  | "overview"
  | "my-page"
  | "photos"
  | "styles"
  | "stylists"
  | "products"
  | "availability"
  | "bookings"
  | "messages"
  | "reviews"
  | "earnings"
  | "promotions"
  | "subscription"
  | "settings";

const nav = [
  ["overview", "Overview", Home],
  ["my-page", "My Page", UserRound],
  ["photos", "Photos", Images],
  ["styles", "Styles & Pricing", Scissors],
  ["stylists", "Stylists", UsersRound],
  ["products", "Products", Package],
  ["availability", "Availability & Calendar", CalendarDays],
  ["bookings", "Bookings", CalendarDays],
  ["messages", "Messages", MessageSquare],
  ["reviews", "Reviews", Star],
  ["earnings", "Finances", CircleDollarSign],
  ["promotions", "Promotions", Megaphone],
  ["subscription", "Subscription", Crown],
  ["settings", "Settings", Settings],
] as const;

const hrefFor = (section: string) =>
  section === "overview" ? "/salon/dashboard" : `/salon/dashboard/${section}`;

export default function OwnerDashboardShell({
  children,
  section,
  salonName,
  salonSlug,
  avatar,
  notifications = [],
  access = null,
}: {
  children: React.ReactNode;
  section: DashboardSection;
  salonName: string;
  salonSlug: string;
  avatar?: string | null;
  notifications?: DashboardNotification[];
  access?: Record<string, boolean> | null;
}) {
  const assistantDocked = useAssistantDocked();
  const [notificationCounts, setNotificationCounts] = useState<
    Record<string, number>
  >({});
  const [actionableBookingCount, setActionableBookingCount] = useState<
    number | null
  >(null);
  const handleNotificationCounts = useCallback(
    (counts: Record<string, number>) => setNotificationCounts(counts),
    [],
  );
  const refreshActionableBookingCount = useCallback(async () => {
    try {
      const session = await getSessionForScope("salon");
      if (!session) return;
      const response = await fetch("/api/salon/actionable-booking-count", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = (await readApiResponse(
        response,
        "Unable to load the actionable booking count.",
      )) as { count?: number; error?: string };
      if (!response.ok) return;
      setActionableBookingCount(Math.max(0, Number(body.count || 0)));
    } catch {
      // Notification-derived count remains as a temporary fallback.
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(
      () => void refreshActionableBookingCount(),
      0,
    );
    const refresh = () => void refreshActionableBookingCount();
    window.addEventListener("gc:owner-booking-update", refresh);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("gc:owner-booking-update", refresh);
    };
  }, [refreshActionableBookingCount]);

  const canAccess = (id: string) =>
    access === null ||
    (id !== "subscription" &&
      Boolean(access[id === "messages" ? "bookings" : id.replace("-", "_")] || id === "earnings" && (access.earnings_own || access.finance_log || access.finance_manage)));
  const visibleNav = nav.filter(([id]) => canAccess(id));
  const homeHref = visibleNav.length
    ? hrefFor(visibleNav[0][0])
    : "/business/login";
  const mobileNav = (
    [
      ["overview", "Overview", Home],
      ["bookings", "Bookings", CalendarDays],
      ["availability", "Calendar", CalendarDays],
      ["messages", "Messages", MessageSquare],
      ["settings", "More", Menu],
    ] as const
  ).filter(([id]) => canAccess(id));
  const navBadge = (id: string) =>
    id === "bookings"
      ? Number(
          actionableBookingCount === null
            ? notificationCounts.bookings || 0
            : actionableBookingCount,
        )
      : id === "messages"
        ? Number(notificationCounts.messages || 0)
        : id === "earnings" || id === "subscription"
          ? Number(notificationCounts.payments || 0)
          : id === "settings"
            ? Number(notificationCounts.errors || 0) +
              Number(notificationCounts.support || 0)
            : 0;

  return (
    <div data-owner-dashboard className="gc-dashboard min-h-screen bg-white text-ink lg:grid lg:grid-cols-[216px_minmax(0,1fr)]">
      <RoleSessionBoundary scope="salon" />
      <OwnerRealtimeAlertBridge />
      <aside className="gc-workspace-sidebar fixed inset-y-0 left-0 z-50 hidden w-[216px] overflow-y-auto px-3 py-5 text-white lg:block">
        <Link
          href={homeHref}
          className="block px-3 font-serif text-[31px] font-bold leading-none"
        >
          <span className="text-[26px]">Girlz Culture</span>
        </Link>
        <nav aria-label="Salon owner navigation" className="mt-7 space-y-1">
          {visibleNav.map(([id, label, Icon]) => {
            const active = section === id;
            const count = navBadge(id);
            return (
              <Link
                key={id}
                href={hrefFor(id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-[9px] px-3 text-[12px] font-medium transition ${
                  active
                    ? "bg-magenta/70 text-white shadow-[0_8px_24px_rgba(0,131,166,.2)]"
                    : "gc-text-on-dark hover:bg-white/10"
                }`}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
                {label}
                {count ? (
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-magenta">
                    {Math.min(count, 99)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        {canAccess("promotions") ? (
          <div className="mt-7 overflow-hidden rounded-[12px] border border-white/15 bg-white/5 p-4">
            <p className="font-serif text-base">
              Grow your brand
              <br />
              with Girlz Culture
            </p>
            <p className="mt-3 text-[10px] leading-4 gc-text-on-dark-muted">
              Reach more clients and build your beauty empire.
            </p>
            <div className="mt-4 h-28 rounded-[10px] bg-[url('/images/hero-braids.jpg')] bg-cover bg-[center_20%]" />
            <Link
              href="/salon/dashboard/promotions"
              className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-white underline-offset-4 hover:underline"
            >
              Learn more →
            </Link>
          </div>
        ) : null}
        <RoleLogoutButton
          scope="salon"
          className="mt-5 flex w-full items-center gap-3 rounded-[9px] px-3 py-3 text-sm gc-text-on-dark hover:bg-white/10"
        />
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="gc-owner-header sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-border bg-white/95 px-3 py-2 backdrop-blur sm:flex-nowrap lg:px-5">
          <DashboardMobileMenu
            ariaLabel="owner navigation"
            items={visibleNav.map(([id, label, Icon]) => ({
              id,
              label,
              href: hrefFor(id),
              icon: Icon,
              active: section === id,
              count: navBadge(id),
            }))}
          />
          <Link
            href={homeHref}
            className="mr-auto shrink-0 font-serif text-[22px] font-bold leading-none text-ink lg:hidden"
          >
            Girlz
            <span className="mt-1 block text-[8px] uppercase tracking-[0.22em] text-amber sm:ml-1 sm:mt-0 sm:inline sm:text-[9px]">
              Culture
            </span>
          </Link>
          <div className="mr-auto hidden min-w-0 max-w-md flex-1 lg:block"><WorkspaceToolbar compact homeHref={homeHref} homeLabel="Overview" current={nav.find(([id]) => id === section)?.[1] || "Workspace"} destinations={visibleNav.map(([id, label]) => ({ label, href: hrefFor(id) }))}/></div>
          <LanguageSelector compact className="order-2 mr-auto sm:order-none sm:mr-0" />
          <div className="flex items-center gap-2">
            <Link
              href={`/salon/${salonSlug}`}
              className="hidden items-center gap-1 text-xs font-semibold text-text-link xl:inline-flex"
            >
              View Public Page
              <ExternalLink aria-hidden="true" size={14} />
            </Link>
            <DashboardNotificationCenter
              scope="salon"
              initialNotifications={notifications}
              onCounts={handleNotificationCounts}
            />
            <div className="hidden h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-blush text-plum sm:grid">
              {avatar ? (
                <SafeImage
                  src={avatar}
                  fallbackSrc={avatar}
                  alt={`${salonName} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound aria-hidden="true" size={19} />
              )}
            </div>
            <span data-no-translate className="hidden max-w-32 truncate text-xs font-semibold xl:block">
              {salonName}
            </span>
            <ChevronDown
              aria-hidden="true"
              size={16}
              className="hidden sm:block"
            />
          </div>
          <div className="order-2 sm:order-none"><GcAssistantLauncher /></div>
        </header>
        <main data-owner-workspace className={`min-w-0 overflow-x-hidden px-4 pb-24 pt-5 sm:px-5 lg:pb-8 ${assistantDocked ? "xl:mr-[336px]" : ""}`}>
          {children}
        </main>
      </div>

      <nav
        aria-label="Owner mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-plum/10 bg-white/95 px-1 pb-[max(7px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(13,17,20,.08)] backdrop-blur lg:hidden"
      >
        {mobileNav.map(([id, label, Icon]) => {
          const active =
            section === id ||
            (id === "settings" &&
              !["overview", "bookings", "availability", "messages"].includes(
                section,
              ));
          const count = navBadge(id);
          return (
            <Link
              key={id}
              href={hrefFor(id)}
              className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-center text-[11px] font-semibold leading-tight ${
                active ? "text-magenta" : "text-ink/70"
              }`}
            >
              <Icon aria-hidden="true" size={19} />
              <span className="max-w-full break-words">{label}</span>
              {count ? (
                <span className="absolute right-1 top-0 rounded-full bg-magenta px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {Math.min(count, 99)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
