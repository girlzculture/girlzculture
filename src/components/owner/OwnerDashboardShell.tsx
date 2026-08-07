"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import SafeImage from "@/components/site/SafeImage";
import RoleLogoutButton, {
  RoleSessionBoundary,
} from "@/components/auth/RoleLogoutButton";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import DashboardNotificationCenter, {
  type DashboardNotification,
} from "@/components/notifications/DashboardNotificationCenter";
import DashboardMobileMenu from "@/components/dashboard/DashboardMobileMenu";

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
  ["overview", "Overview"],
  ["my-page", "My Page"],
  ["photos", "Photos"],
  ["styles", "Styles & Pricing"],
  ["stylists", "Stylists"],
  ["products", "Products"],
  ["availability", "Availability & Calendar"],
  ["bookings", "Bookings"],
  ["messages", "Messages"],
  ["reviews", "Reviews"],
  ["earnings", "Earnings & Payouts"],
  ["promotions", "Promotions"],
  ["subscription", "Subscription"],
  ["settings", "Settings"],
] as const;

const hrefFor = (section: string) =>
  section === "overview" ? "/salon/dashboard" : `/salon/dashboard/${section}`;

function initials(value: string) {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "GC";
}

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
  const [notificationCounts, setNotificationCounts] = useState<
    Record<string, number>
  >({});
  const handleNotificationCounts = useCallback(
    (counts: Record<string, number>) => setNotificationCounts(counts),
    [],
  );
  const canAccess = (id: string) =>
    access === null ||
    (id !== "subscription" &&
      Boolean(access[id === "messages" ? "bookings" : id.replace("-", "_")]));
  const visibleNav = nav.filter(([id]) => canAccess(id));
  const homeHref = visibleNav.length
    ? hrefFor(visibleNav[0][0])
    : "/salon/login";
  const mobileNav = (
    [
      ["overview", "Overview"],
      ["bookings", "Bookings"],
      ["availability", "Calendar"],
      ["messages", "Messages"],
      ["settings", "More"],
    ] as const
  ).filter(([id]) => canAccess(id));
  const navBadge = (id: string) =>
    id === "bookings"
      ? Number(notificationCounts.bookings || 0)
      : id === "messages"
        ? Number(notificationCounts.messages || 0)
        : id === "earnings" || id === "subscription"
          ? Number(notificationCounts.payments || 0)
          : id === "settings"
            ? Number(notificationCounts.errors || 0) +
              Number(notificationCounts.support || 0)
            : 0;
  const salonInitials = useMemo(() => initials(salonName), [salonName]);

  return (
    <div className="min-h-screen bg-cream text-ink lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <RoleSessionBoundary scope="salon" />
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[220px] overflow-y-auto bg-charcoal px-4 py-5 text-white lg:block">
        <Link
          href={homeHref}
          className="block px-3 font-serif text-[31px] font-bold leading-none"
        >
          Girlz
          <span className="block pl-1 text-[10px] uppercase tracking-[0.35em] text-amber">
            Culture
          </span>
        </Link>
        <nav aria-label="Salon owner navigation" className="mt-7 space-y-1">
          {visibleNav.map(([id, label]) => {
            const active = section === id;
            const count = navBadge(id);
            return (
              <Link
                key={id}
                href={hrefFor(id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-[9px] px-3 text-[12px] font-semibold transition ${
                  active
                    ? "bg-magenta/70 text-white shadow-[0_8px_24px_rgba(0,131,166,.2)]"
                    : "text-white/85 hover:bg-white/10"
                }`}
              >
                {label}
                {count ? (
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-magenta">
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
              Grow your brand with Girlz Culture
            </p>
            <p className="mt-3 text-[11px] leading-5 text-white/75">
              Reach more clients and promote eligible services, products, and offers.
            </p>
            <Link
              href="/salon/dashboard/promotions"
              className="mt-3 inline-flex min-h-9 items-center text-[12px] font-semibold text-white underline-offset-4 hover:underline"
            >
              Manage promotions
            </Link>
          </div>
        ) : null}
        <RoleLogoutButton
          scope="salon"
          className="mt-5 flex min-h-11 w-full items-center rounded-[9px] px-3 py-3 text-sm font-semibold text-white/85 hover:bg-white/10"
        />
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="gc-brand-header sticky top-0 z-40 flex min-h-[74px] items-center gap-3 border-b border-plum/10 px-3 py-2 backdrop-blur sm:px-4 lg:px-8">
          <DashboardMobileMenu
            ariaLabel="owner navigation"
            items={visibleNav.map(([id, label]) => ({
              id,
              label,
              href: hrefFor(id),
              active: section === id,
              count: navBadge(id),
            }))}
          />
          <Link
            href={homeHref}
            className="hidden shrink-0 font-serif text-[27px] font-bold text-plum sm:block"
          >
            Girlz
            <span className="ml-1 text-[9px] uppercase tracking-[0.22em] text-amber">
              Culture
            </span>
          </Link>
          <LanguageSelector compact className="ml-auto" />
          <Link
            href={`/salon/${salonSlug}`}
            className="hidden min-h-10 items-center rounded-[8px] px-2 text-xs font-bold text-plum sm:inline-flex"
          >
            View Public Page
          </Link>
          <DashboardNotificationCenter
            scope="salon"
            initialNotifications={notifications}
            onCounts={handleNotificationCounts}
          />
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-blush text-sm font-bold text-plum">
            {avatar ? (
              <SafeImage
                src={avatar}
                fallbackSrc={avatar}
                alt={`${salonName} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              salonInitials
            )}
          </div>
          <span className="hidden max-w-40 truncate text-xs font-semibold xl:block">
            {salonName}
          </span>
        </header>
        <main className="min-w-0 px-3 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      <nav
        aria-label="Owner mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 border-t border-plum/10 bg-white/95 px-1 pb-[max(7px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(13,17,20,.08)] backdrop-blur lg:hidden"
      >
        {mobileNav.map(([id, label]) => {
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
              className={`relative flex min-h-11 items-center justify-center rounded-[8px] px-1 text-center text-[11px] font-bold ${
                active ? "bg-blush text-magenta" : "text-ink/75"
              }`}
            >
              {label}
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
