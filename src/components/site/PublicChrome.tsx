import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Heart,
  Home,
  Menu,
  MessageSquare,
  Search,
  Share2,
  ShieldCheck,
  Tag,
  UserRound,
} from "lucide-react";

type ActiveTab = "home" | "search" | "bookings" | "inbox" | "profile";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Girlz Culture home"
      className={`font-serif font-bold tracking-[-0.045em] text-plum ${compact ? "text-[22px] md:text-[30px]" : "text-[30px]"}`}
    >
      Girlz Culture
    </Link>
  );
}

export function PublicHeader({ active }: { active?: "styles" | "salons" | "how" }) {
  return (
    <header className="relative z-40 border-b border-plum/[0.08] bg-cream/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1760px] items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-12 2xl:px-16">
        <details className="group relative md:hidden">
          <summary
            aria-label="Open navigation menu"
            className="inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl text-ink [&::-webkit-details-marker]:hidden"
          >
            <Menu aria-hidden="true" size={23} strokeWidth={1.8} />
          </summary>
          <nav aria-label="Mobile navigation" className="absolute left-0 top-12 w-64 overflow-hidden rounded-[14px] border border-plum/10 bg-[#fffdfa] p-2 text-sm font-semibold text-ink shadow-[0_18px_42px_rgba(26,18,32,0.16)]">
            <Link href="/styles" className="block rounded-[10px] px-4 py-3 hover:bg-blush/45">Browse Styles</Link>
            <Link href="/salons" className="block rounded-[10px] px-4 py-3 hover:bg-blush/45">Find Salons</Link>
            <Link href="/how-it-works" className="block rounded-[10px] px-4 py-3 hover:bg-blush/45">How It Works</Link>
            <Link href="/salon/signup" className="block rounded-[10px] px-4 py-3 text-magenta hover:bg-blush/45">For Professionals</Link>
            <div className="my-1 border-t border-plum/10" />
            <Link href="/salon/login" className="block rounded-[10px] px-4 py-3 hover:bg-blush/45">Log in</Link>
            <Link href="/salon/signup" className="block rounded-[10px] bg-magenta px-4 py-3 text-center text-white">Sign up</Link>
          </nav>
        </details>

        <div className="absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0">
          <Wordmark compact />
        </div>

        <nav aria-label="Main navigation" className="hidden items-center gap-8 text-[13px] font-semibold text-ink md:flex lg:gap-10">
          <Link href="/styles" className={`border-b-2 py-5 transition-colors hover:text-magenta ${active === "styles" ? "border-magenta text-magenta" : "border-transparent"}`}>Browse Styles</Link>
          <Link href="/salons" className={`border-b-2 py-5 transition-colors hover:text-magenta ${active === "salons" ? "border-magenta text-magenta" : "border-transparent"}`}>Find Salons</Link>
          <Link href="/how-it-works" className={`border-b-2 py-5 transition-colors hover:text-magenta ${active === "how" ? "border-magenta text-magenta" : "border-transparent"}`}>How It Works</Link>
          <Link href="/salon/signup" className="inline-flex items-center gap-2 transition-colors hover:text-magenta">
            For Professionals
            <span className="rounded-full bg-magenta px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white">New</span>
          </Link>
        </nav>

        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/account?tab=favorites"
            aria-label="View favorite salons"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink transition-colors hover:bg-blush/50 hover:text-magenta"
          >
            <Heart aria-hidden="true" size={21} strokeWidth={1.7} />
          </Link>
          <Link href="/salon/login" className="hidden min-h-11 items-center px-2 text-[13px] font-semibold text-ink transition-colors hover:text-magenta md:inline-flex">
            Log in
          </Link>
          <Link href="/salon/signup" className="hidden min-h-11 items-center rounded-[10px] bg-magenta px-5 text-[13px] font-bold text-white shadow-[0_8px_24px_rgba(214,24,107,0.18)] transition hover:-translate-y-0.5 hover:bg-[#bb145d] md:inline-flex">
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}

export function CustomerBottomNav({ active = "home" }: { active?: ActiveTab }) {
  const items = [
    { id: "home" as const, label: "Home", href: "/", icon: Home },
    { id: "search" as const, label: "Search", href: "/salons", icon: Search },
    { id: "bookings" as const, label: "Bookings", href: "/account", icon: CalendarDays },
    { id: "inbox" as const, label: "Inbox", href: "/account", icon: MessageSquare },
    { id: "profile" as const, label: "Profile", href: "/account", icon: UserRound },
  ];

  return (
    <nav
      aria-label="Customer navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-plum/10 bg-[#fffdfa]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_28px_rgba(26,18,32,0.08)] backdrop-blur-xl md:hidden"
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
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${isActive ? "text-magenta" : "text-ink/75"}`}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={isActive ? 2.4 : 1.8} />
              {item.label}
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
    description: "Every salon is vetted for quality, safety, and professionalism.",
    icon: ShieldCheck,
  },
  {
    title: "Real Reviews",
    description: "Real clients. Real feedback. No filters.",
    icon: MessageSquare,
  },
  {
    title: "Transparent Pricing",
    description: "Upfront pricing, so there are no surprises.",
    icon: Tag,
  },
];

export function TrustStrip() {
  return (
    <section aria-label="Why clients trust Girlz Culture" className="hidden bg-[linear-gradient(110deg,#24102b_0%,#35123b_50%,#211027_100%)] text-white md:block">
      <div className="mx-auto grid w-full max-w-[1760px] gap-0 px-5 py-5 sm:grid-cols-3 sm:px-8 lg:px-12 2xl:px-16">
        {trustItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className={`flex items-center gap-4 py-4 sm:px-6 ${index > 0 ? "border-t border-white/15 sm:border-l sm:border-t-0" : ""}`}>
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber text-ink shadow-[0_0_0_6px_rgba(224,163,78,0.10)]">
                <Icon aria-hidden="true" size={24} strokeWidth={1.8} />
              </span>
              <span>
                <span className="block font-serif text-[18px] font-semibold leading-tight">{item.title}</span>
                <span className="mt-1 block max-w-[260px] text-[11px] leading-[1.45] text-white/75">{item.description}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const footerGroups = [
  { title: "Company", links: ["About Us", "Careers", "Press", "Blog"] },
  { title: "Support", links: ["Help Center", "Safety", "Cancellation Policy", "Contact Us"] },
  { title: "For Professionals", links: ["List Your Salon", "Tools & Resources", "Success Stories"] },
  { title: "Legal", links: ["Terms of Service", "Privacy Policy", "Accessibility"] },
];

export function PublicFooter() {
  return (
    <footer className="hidden bg-[#211027] text-white md:block">
      <div className="mx-auto grid w-full max-w-[1760px] grid-cols-[1.2fr_repeat(4,0.7fr)_1.35fr] gap-8 px-10 py-9 xl:px-12 2xl:px-16">
        <div>
          <div className="font-serif text-[25px] font-bold tracking-[-0.035em]">Girlz Culture</div>
          <p className="mt-3 max-w-[200px] text-[11px] leading-5 text-white/70">The trusted beauty booking marketplace for braided styles.</p>
          <div className="mt-5 flex gap-3 text-white/75">
            <Camera aria-label="Instagram" size={17} />
            <Share2 aria-label="Social channels" size={17} />
          </div>
        </div>
        {footerGroups.map((group) => (
          <div key={group.title}>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/80">{group.title}</h2>
            <ul className="mt-3 space-y-2 text-[11px] text-white/65">
              {group.links.map((link) => <li key={link}><span>{link}</span></li>)}
            </ul>
          </div>
        ))}
        <div>
          <h2 className="font-serif text-[17px] font-semibold">Stay in the loop</h2>
          <p className="mt-2 text-[11px] leading-5 text-white/65">Tips, new salons, and exclusive offers.</p>
          <form className="mt-4 flex overflow-hidden rounded-[8px] border border-white/20 bg-white/5">
            <label htmlFor="footer-email" className="sr-only">Email address</label>
            <input id="footer-email" type="email" placeholder="Enter your email" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[11px] text-white outline-none placeholder:text-white/40" />
            <button type="submit" className="bg-magenta px-4 text-[10px] font-bold text-white">Subscribe</button>
          </form>
          <p className="mt-5 text-[9px] text-white/45">© {new Date().getFullYear()} Girlz Culture, Inc. All rights reserved.</p>
        </div>
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
        <h2 className="font-serif text-[22px] font-semibold leading-none tracking-[-0.025em] text-ink sm:text-[25px]">{title}</h2>
        {description ? <p className="mt-2 text-[12px] text-ink/65">{description}</p> : null}
      </div>
      {href && linkLabel ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-magenta hover:text-plum">
          {linkLabel} <ArrowRight aria-hidden="true" size={14} />
        </Link>
      ) : null}
    </div>
  );
}
