import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Heart,
  Home,
  MessageSquare,
  Search,
  Share2,
  ShieldCheck,
  Tag,
  UserRound,
} from "lucide-react";
import NewsletterForm from "@/components/site/NewsletterForm";
import MobilePublicMenu from "@/components/site/MobilePublicMenu";
import HeaderStyleSearch from "@/components/search/HeaderStyleSearch";
import {
  getNavigationItems,
  getVisibleLegalLinks,
  type NavigationItem,
} from "@/lib/content";
import LanguageSelector, {
  LocalizedText,
} from "@/components/i18n/LanguageSelector";
import { getPublishedBrandAssets } from "@/lib/brandAssets";

type ActiveTab = "home" | "search" | "bookings" | "social" | "profile";

export async function Wordmark({ compact = false }: { compact?: boolean }) {
  const assets = await getPublishedBrandAssets();
  const desktop = assets.primary_header_logo || assets.dark_logo;
  const mobile = assets.mobile_logo || desktop;
  return (
    <Link
      href="/"
      aria-label="Girlz Culture home"
      className={`inline-flex shrink-0 items-center font-serif font-bold tracking-[-0.045em] text-plum ${
        compact ? "text-[22px] md:text-[30px]" : "text-[30px]"
      }`}
    >
      {desktop?.published_url ? (
        <>
          <img
            src={mobile?.published_url || desktop.published_url}
            alt={
              mobile?.published_alt_text ||
              desktop.published_alt_text ||
              "Girlz Culture"
            }
            className="h-8 w-auto max-w-[132px] object-contain md:hidden"
            style={{
              objectPosition: `${mobile?.published_focal_x ?? 50}% ${mobile?.published_focal_y ?? 50}%`,
            }}
          />
          <img
            src={desktop.published_url}
            alt={desktop.published_alt_text || "Girlz Culture"}
            className="hidden h-9 w-auto max-w-[210px] object-contain md:block"
            style={{
              objectPosition: `${desktop.published_focal_x ?? 50}% ${desktop.published_focal_y ?? 50}%`,
            }}
          />
        </>
      ) : (
        "Girlz Culture"
      )}
    </Link>
  );
}

const defaultHeader: NavigationItem[] = [
  {
    surface: "header",
    group_key: "main",
    item_key: "styles",
    label: "Browse Styles",
    translation_key: "nav.styles",
    href: "/styles",
    sort_order: 10,
  },
  {
    surface: "header",
    group_key: "main",
    item_key: "salons",
    label: "Find Salons",
    translation_key: "nav.salons",
    href: "/salons",
    sort_order: 20,
  },
  {
    surface: "header",
    group_key: "main",
    item_key: "how",
    label: "How It Works",
    translation_key: "nav.how",
    href: "/how-it-works",
    sort_order: 30,
  },
  {
    surface: "header",
    group_key: "main",
    item_key: "about",
    label: "About Us",
    translation_key: "nav.about",
    href: "/about",
    sort_order: 40,
  },
  {
    surface: "header",
    group_key: "main",
    item_key: "blog",
    label: "Blog",
    translation_key: "nav.blog",
    href: "/blog",
    sort_order: 50,
  },
  {
    surface: "header",
    group_key: "main",
    item_key: "partner",
    label: "Partner With Us",
    translation_key: "nav.partner",
    href: "/partner",
    sort_order: 60,
    show_new_badge: true,
  },
];

const defaultMobileMenu: NavigationItem[] = [
  ...defaultHeader.map((item) => ({
    ...item,
    surface: "mobile_menu" as const,
  })),
  {
    surface: "mobile_menu",
    group_key: "main",
    item_key: "social",
    label: "Social",
    translation_key: "nav.social",
    href: "/social",
    sort_order: 70,
  },
];

export async function PublicHeader({
  active,
}: {
  active?: "styles" | "salons" | "how" | "about" | "blog";
}) {
  const [headerItems, mobileItems] = await Promise.all([
    getNavigationItems("header", defaultHeader),
    getNavigationItems("mobile_menu", defaultMobileMenu),
  ]);
  return (
    <header
      role="banner"
      data-public-header
      data-language-selector-host
      className="gc-brand-header relative z-[90] border-b border-plum/[0.08] backdrop-blur-xl"
    >
      <div data-public-header-layout className="mx-auto flex h-16 w-full max-w-[1760px] items-center gap-2 px-3 sm:px-6 lg:px-10 xl:px-12 2xl:px-10 min-[1700px]:px-16">
        <div data-public-header-zone="brand" className="flex min-w-0 shrink-0 items-center gap-1">
          <MobilePublicMenu links={mobileItems} />
          <Wordmark compact />
        </div>

        <nav
          aria-label="Main navigation"
          data-public-header-zone="navigation"
          className="hidden min-w-0 flex-1 items-center justify-center gap-5 whitespace-nowrap text-[13px] font-semibold text-ink 2xl:flex min-[1700px]:gap-8"
        >
          {headerItems.map((item) => (
            <Link
              key={item.item_key}
              href={item.href}
              className={`inline-flex items-center gap-2 border-b-2 py-5 transition-colors hover:text-magenta ${
                active === item.item_key
                  ? "border-magenta text-magenta"
                  : "border-transparent"
              }`}
            >
              <LocalizedText
                messageKey={
                  item.translation_key || `navigation.${item.item_key}`
                }
                fallback={item.label}
              />
              {item.show_new_badge ? (
                <span className="rounded-full bg-magenta px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white">
                  <LocalizedText messageKey="nav.new" fallback="New" />
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div data-public-header-zone="actions" className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <div className="hidden 2xl:block">
            <LanguageSelector compact />
          </div>
          <HeaderStyleSearch />
          <Link
            href="/account?tab=favorites"
            aria-label="View favorite salons"
            className="hidden h-11 w-11 items-center justify-center rounded-xl text-ink transition-colors hover:bg-blush/50 hover:text-magenta 2xl:inline-flex"
          >
            <Heart aria-hidden="true" size={21} strokeWidth={1.7} />
          </Link>
          <Link
            href="/login"
            className="hidden min-h-11 items-center whitespace-nowrap px-2 text-[13px] font-semibold text-ink transition-colors hover:text-magenta 2xl:inline-flex"
          >
            <LocalizedText messageKey="nav.login" fallback="Log in" />
          </Link>
          <Link
            href="/login"
            className="gc-brand-primary-action hidden min-h-11 items-center whitespace-nowrap rounded-[10px] bg-magenta px-4 text-[13px] font-bold text-white shadow-[0_8px_24px_rgba(0,131,166,0.18)] transition hover:-translate-y-0.5 2xl:inline-flex min-[1700px]:px-5"
          >
            <LocalizedText messageKey="nav.signup" fallback="Sign up" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export async function CustomerBottomNav({
  active = "home",
}: {
  active?: ActiveTab;
}) {
  const fallback: NavigationItem[] = [
    {
      surface: "mobile_bottom",
      group_key: "main",
      item_key: "home",
      label: "Home",
      translation_key: "nav.home",
      href: "/",
      sort_order: 10,
    },
    {
      surface: "mobile_bottom",
      group_key: "main",
      item_key: "search",
      label: "Search",
      translation_key: "nav.search",
      href: "/salons",
      sort_order: 20,
    },
    {
      surface: "mobile_bottom",
      group_key: "main",
      item_key: "bookings",
      label: "Bookings",
      translation_key: "nav.bookings",
      href: "/account",
      sort_order: 30,
    },
    {
      surface: "mobile_bottom",
      group_key: "main",
      item_key: "social",
      label: "Social",
      translation_key: "nav.social",
      href: "/social",
      sort_order: 40,
    },
    {
      surface: "mobile_bottom",
      group_key: "main",
      item_key: "profile",
      label: "Profile",
      translation_key: "nav.profile",
      href: "/account?tab=inbox",
      sort_order: 50,
    },
  ];
  const iconMap = {
    home: Home,
    search: Search,
    bookings: CalendarDays,
    social: Share2,
    profile: UserRound,
  };
  const records = await getNavigationItems("mobile_bottom", fallback);
  const items = records.slice(0, 5).map((item) => ({
    ...item,
    id: item.item_key as ActiveTab,
    key: item.translation_key || `navigation.${item.item_key}`,
    icon: iconMap[item.item_key as keyof typeof iconMap] || Home,
  }));

  return (
    <nav
      aria-label="Customer navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-plum/10 bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_28px_rgba(13,17,20,0.08)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${
                isActive ? "text-magenta" : "text-ink/75"
              }`}
            >
              <Icon
                aria-hidden="true"
                size={20}
                strokeWidth={isActive ? 2.4 : 1.8}
              />
              <LocalizedText messageKey={item.key} fallback={item.label} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const trustItems = [
  {
    title: "Verified Salons",
    titleKey: "trust.salons.title",
    description:
      "Every salon is vetted for quality, safety, and professionalism.",
    descriptionKey: "trust.salons.body",
    icon: ShieldCheck,
  },
  {
    title: "Booking-based Reviews",
    titleKey: "trust.reviews.title",
    description: "Reviews are connected to completed appointments.",
    descriptionKey: "trust.reviews.body",
    icon: MessageSquare,
  },
  {
    title: "Transparent Pricing",
    titleKey: "trust.pricing.title",
    description: "Upfront pricing, so there are no surprises.",
    descriptionKey: "trust.pricing.body",
    icon: Tag,
  },
];

export function TrustStrip() {
  return (
    <section
      aria-label="Why clients trust Girlz Culture"
      className="gc-strong-surface hidden md:block"
    >
      <div className="mx-auto grid w-full max-w-[1760px] gap-0 px-5 py-5 sm:grid-cols-3 sm:px-8 lg:px-12 2xl:px-16">
        {trustItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className={`flex items-center gap-4 py-4 sm:px-6 ${
                index > 0
                  ? "border-t border-white/15 sm:border-l sm:border-t-0"
                  : ""
              }`}
            >
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber text-ink shadow-[0_0_0_6px_rgba(224,163,78,0.10)]">
                <Icon aria-hidden="true" size={24} strokeWidth={1.8} />
              </span>
              <span>
                <span className="block font-serif text-[18px] font-semibold leading-tight">
                  <LocalizedText
                    messageKey={item.titleKey}
                    fallback={item.title}
                  />
                </span>
                <span className="mt-1 block max-w-[260px] text-[11px] leading-[1.45] gc-text-on-dark-muted">
                  <LocalizedText
                    messageKey={item.descriptionKey}
                    fallback={item.description}
                  />
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const defaultFooter: NavigationItem[] = [
  {
    surface: "footer",
    group_key: "company",
    item_key: "about",
    label: "About Us",
    href: "/about",
    sort_order: 10,
  },
  {
    surface: "footer",
    group_key: "company",
    item_key: "press",
    label: "Press",
    href: "/press",
    sort_order: 20,
  },
  {
    surface: "footer",
    group_key: "company",
    item_key: "blog",
    label: "Blog",
    translation_key: "nav.blog",
    href: "/blog",
    sort_order: 30,
  },
  {
    surface: "footer",
    group_key: "company",
    item_key: "testimonials",
    label: "Testimonials",
    href: "/testimonials",
    sort_order: 40,
  },
  {
    surface: "footer",
    group_key: "support",
    item_key: "help",
    label: "Help Center",
    href: "/help",
    sort_order: 10,
  },
  {
    surface: "footer",
    group_key: "support",
    item_key: "safety",
    label: "Safety & Trust",
    href: "/safety",
    sort_order: 20,
  },
  {
    surface: "footer",
    group_key: "support",
    item_key: "contact",
    label: "Contact Us",
    href: "/contact",
    sort_order: 30,
  },
  {
    surface: "footer",
    group_key: "support",
    item_key: "complaint",
    label: "Submit a Complaint",
    href: "/complaint",
    sort_order: 40,
  },
  {
    surface: "footer",
    group_key: "professionals",
    item_key: "partner",
    label: "Partner With Us",
    translation_key: "nav.partner",
    href: "/partner",
    sort_order: 10,
  },
  {
    surface: "footer",
    group_key: "legal",
    item_key: "legal-policies",
    label: "Legal & Policies",
    href: "/legal",
    sort_order: 10,
  },
];

const footerGroupLabels: Record<string, { title: string; key: string }> = {
  company: { title: "Company", key: "footer.company" },
  support: { title: "Support", key: "footer.support" },
  professionals: {
    title: "For Professionals",
    key: "footer.professionals",
  },
  legal: { title: "Legal & Policies", key: "footer.legal" },
};

export async function PublicFooter({
  reserveMobileNavigation = false,
}: {
  reserveMobileNavigation?: boolean;
} = {}) {
  const [legalLinks, footerItems, brandAssets] = await Promise.all([
    getVisibleLegalLinks(),
    getNavigationItems("footer", defaultFooter),
    getPublishedBrandAssets(),
  ]);
  const footerLogo = brandAssets.light_logo;
  const legalColumns = [
    legalLinks.filter((_, index) => index % 2 === 0),
    legalLinks.filter((_, index) => index % 2 === 1),
  ];
  const footerGroups = Array.from(
    new Set(footerItems.map((item) => item.group_key)),
  ).map((groupKey) => ({
    groupKey,
    ...(footerGroupLabels[groupKey] || {
      title: groupKey.replaceAll("_", " "),
      key: `footer.${groupKey}`,
    }),
    links: footerItems.filter((item) => item.group_key === groupKey),
  }));
  const desktopGroups = footerGroups.filter((group) => group.groupKey !== "legal");
  const mobileGroups = desktopGroups.filter((group) => ["company", "professionals", "support"].includes(group.groupKey));
  // `getNavigationItems` already supplies defaults only when the navigation
  // source is unavailable. Do not add a second fallback here: a missing legal
  // item in an otherwise successful read means the founder disabled it.
  const mobileLegalItem = footerItems.find((item) => item.item_key === "legal-policies");
  return (
    <footer className="gc-brand-footer overflow-x-clip text-white">
      <div className="mx-auto hidden w-full max-w-[1760px] grid-cols-2 gap-8 px-5 py-9 sm:px-8 md:grid lg:px-10 xl:grid-cols-[1.05fr_.65fr_.65fr_.7fr_1.55fr_1.2fr] xl:px-12 2xl:px-16">
        <div className="min-w-0">
          {footerLogo?.published_url ? (
            <img
              src={footerLogo.published_url}
              alt={footerLogo.published_alt_text || "Girlz Culture"}
              className="h-10 w-auto max-w-[220px] object-contain object-left"
            />
          ) : (
            <div className="font-serif text-[25px] font-bold tracking-[-0.035em]">
              Girlz Culture
            </div>
          )}
          <div className="mt-5 flex gap-3 gc-text-on-dark-muted">
            <Camera aria-label="Instagram" size={17} />
            <Share2 aria-label="Social channels" size={17} />
          </div>
        </div>
        {desktopGroups.map((group) => (
          <div key={group.groupKey} className="min-w-0">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.08em] gc-text-on-dark">
              <LocalizedText
                messageKey={group.key}
                fallback={group.title}
              />
            </h2>
            <ul className="mt-3 min-w-0 space-y-2 [overflow-wrap:anywhere] text-[11px] gc-text-on-dark-muted">
              {group.links.map((item) => (
                <li key={item.item_key}>
                  <Link href={item.href} className="hover:text-white">
                    <LocalizedText
                      messageKey={
                        item.translation_key ||
                        `navigation.${item.item_key}`
                      }
                      fallback={item.label}
                    />
                    {item.show_new_badge ? (
                      <span className="ml-1 rounded-full bg-magenta px-1.5 py-0.5 text-[7px] font-bold uppercase">
                        New
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {legalLinks.length ? (
          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 [overflow-wrap:anywhere] xl:col-span-1">
            {legalColumns.map((column, index) => (
              <ul
                key={index}
                className="space-y-2 text-[10px] leading-4 gc-text-on-dark-muted"
              >
                {column.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        ) : (
          <div className="hidden xl:block" />
        )}
        <div className="col-span-2 min-w-0 xl:col-span-1">
          <h2 className="font-serif text-[17px] font-semibold">
            <LocalizedText
              messageKey="footer.newsletter"
              fallback="Stay in the loop"
            />
          </h2>
          <p className="mt-2 text-[11px] leading-5 gc-text-on-dark-muted">
            <LocalizedText
              messageKey="footer.newsletter_help"
              fallback="Tips, new salons, and exclusive offers."
            />
          </p>
          <NewsletterForm />
          <p className="mt-5 text-[9px] gc-text-on-dark-muted">
            © {new Date().getFullYear()} Girlz Culture, Inc.{" "}
            <LocalizedText
              messageKey="footer.rights"
              fallback="All rights reserved."
            />
          </p>
        </div>
      </div>
      <div className={`mx-auto w-full max-w-[680px] px-4 pt-6 md:hidden ${reserveMobileNavigation ? "pb-[calc(7rem+env(safe-area-inset-bottom))]" : "pb-[calc(2rem+env(safe-area-inset-bottom))]"}`}>
        <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-5">
          <div className="min-w-0">{footerLogo?.published_url ? <img src={footerLogo.published_url} alt={footerLogo.published_alt_text || "Girlz Culture"} className="h-9 w-auto max-w-[210px] object-contain object-left"/> : <div className="font-serif text-2xl font-bold">Girlz Culture</div>}</div>
          <div className="flex shrink-0 gap-3 gc-text-on-dark-muted"><Camera aria-label="Instagram" size={18}/><Share2 aria-label="Social channels" size={18}/></div>
        </div>
        <nav aria-label="Footer" className="divide-y divide-white/15">
          {mobileGroups.map((group, index) => <details key={group.groupKey} open={index === 0} className="group py-1"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[.08em] gc-text-on-dark [&::-webkit-details-marker]:hidden"><LocalizedText messageKey={group.key} fallback={group.title}/><span aria-hidden="true" className="text-lg font-normal transition-transform group-open:rotate-45">+</span></summary><ul className="space-y-1 pb-3">{group.links.map((item) => <li key={item.item_key}><Link href={item.href} className="flex min-h-11 items-center text-sm gc-text-on-dark-muted"><LocalizedText messageKey={item.translation_key || `navigation.${item.item_key}`} fallback={item.label}/>{item.show_new_badge ? <span className="ml-2 rounded-full bg-magenta px-2 py-0.5 text-[8px] font-bold uppercase text-white">New</span> : null}</Link></li>)}</ul></details>)}
          {mobileLegalItem ? <Link href={mobileLegalItem.href} className="flex min-h-12 items-center justify-between text-xs font-bold uppercase tracking-[.08em] gc-text-on-dark"><span>{mobileLegalItem.label}</span><span aria-hidden="true">→</span></Link> : null}
        </nav>
        <section className="mt-5 rounded-[16px] border border-white/15 bg-white/5 p-4"><h2 className="font-serif text-xl font-semibold"><LocalizedText messageKey="footer.newsletter" fallback="Stay in the loop"/></h2><p className="mt-1 text-[11px] leading-5 gc-text-on-dark-muted"><LocalizedText messageKey="footer.newsletter_help" fallback="Tips, new salons, and exclusive offers."/></p><NewsletterForm/></section>
        <p className="mt-5 text-[10px] gc-text-on-dark-muted">© {new Date().getFullYear()} Girlz Culture, Inc. <LocalizedText messageKey="footer.rights" fallback="All rights reserved."/></p>
      </div>
    </footer>
  );
}

export function SectionHeading({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-1 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-serif text-[22px] font-semibold leading-none tracking-[-0.025em] text-ink sm:text-[25px]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-[12px] text-ink/65">{description}</p>
        ) : null}
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-magenta hover:text-plum"
        >
          {linkLabel}
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      ) : null}
    </div>
  );
}
