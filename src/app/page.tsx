import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Heart, Search, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";
import SearchComposer from "@/components/site/SearchComposer";
import { getContentPage } from "@/lib/content";
import {
  CustomerBottomNav,
  PublicFooter,
  PublicHeader,
  SectionHeading,
  TrustStrip,
} from "@/components/site/PublicChrome";

type Salon = {
  id: string;
  name: string | null;
  slug: string | null;
  neighborhood: string | null;
  address_city: string | null;
  rating_overall: number | null;
  review_count: number | null;
  cover_photo_url: string | null;
  badges: string[] | string | null;
  subscription_tier: string | null;
  verification_status: string | null;
};

type StylePrice = {
  salon_id: string | null;
  price_display_min: number | null;
};

const salonFallbackImages = [
  "/images/salon-blush.jpg",
  "/images/salon-modern.jpg",
  "/images/salon-warm.jpg",
  "/images/salon-dark.jpg",
];

function formatRating(value: number | null) {
  return typeof value === "number" && value > 0 ? value.toFixed(1) : "New";
}

// Centralized so paid-placement rules can be adjusted without touching the UI.
// When coordinates are available, distance can be added as the next comparison
// within each subscription tier.
const SUBSCRIPTION_TIER_PRIORITY: Record<string, number> = {
  premium: 3,
  platinum: 3,
  growth: 2,
  essentials: 2,
  basic: 1,
  "free-seed": 0,
  free: 0,
};

function getSubscriptionTierPriority(tier: string | null) {
  const normalizedTier = tier?.trim().toLowerCase().replace(/\s+/g, "-") || "";
  return SUBSCRIPTION_TIER_PRIORITY[normalizedTier] || 0;
}

function rankSalonsForNearbyDiscovery(salons: Salon[]) {
  return [...salons].sort((left, right) => {
    const tierDifference = getSubscriptionTierPriority(right.subscription_tier) - getSubscriptionTierPriority(left.subscription_tier);
    if (tierDifference) return tierDifference;

    const reviewDifference = (right.review_count || 0) - (left.review_count || 0);
    if (reviewDifference) return reviewDifference;

    return (right.rating_overall || 0) - (left.rating_overall || 0);
  });
}

function SalonCard({
  salon,
  index,
  price,
  ctaLabel,
  prominent = false,
}: {
  salon: Salon;
  index: number;
  price: number | null | undefined;
  ctaLabel: "View salon" | "View times";
  prominent?: boolean;
}) {
  const image = salon.cover_photo_url || salonFallbackImages[index % salonFallbackImages.length];
  const salonHref = salon.slug ? `/salon/${salon.slug}` : "/search";
  const imageHeight = prominent ? "h-[126px] lg:h-[118px] 2xl:h-[132px]" : "h-[112px] lg:h-[98px]";

  return (
    <article className="w-[72vw] max-w-[280px] shrink-0 snap-start overflow-hidden rounded-[14px] border border-plum/10 bg-[#fffdfa] shadow-[0_4px_16px_rgba(26,18,32,0.06)] sm:w-auto sm:max-w-none">
      <Link href={salonHref} className="group block">
        <div className={`relative overflow-hidden bg-blush ${imageHeight}`}>
          <Image src={image} alt={`${salon.name || "Salon"} interior`} fill sizes="(max-width: 640px) 72vw, 25vw" className="object-cover transition duration-500 group-hover:scale-[1.02]" />
          {salon.subscription_tier?.toLowerCase() === "premium" || salon.verification_status?.toLowerCase() === "verified" ? <span className="absolute left-3 top-3 rounded-full bg-plum/95 px-3 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-white">{salon.subscription_tier?.toLowerCase() === "premium" ? "Premium" : "Verified"}</span> : null}
          <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-ink shadow-sm backdrop-blur"><Heart size={17} /></span>
        </div>
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-[15px] font-semibold leading-tight text-ink">{salon.name || "Salon"}</h3>
              <p className="mt-1 text-[10px] text-ink/55">{salon.neighborhood || salon.address_city || "Location not provided"}</p>
            </div>
            <p className="shrink-0 text-[10px] text-ink/60"><span className="text-amber">★</span> {formatRating(salon.rating_overall)} <span>({salon.review_count || 0})</span></p>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-plum/10 pt-2">
            <p className="text-[10px] text-ink/55">From <strong className="font-serif text-[17px] text-ink">{typeof price === "number" ? `$${price}` : "—"}</strong></p>
            <span className="rounded-[8px] border border-magenta px-3 py-1.5 text-[9px] font-bold text-magenta">{ctaLabel}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default async function Home() {
  const homeContent = await getContentPage("home", { slug: "home", title: "Home", hero_title: "Book with Confidence.", hero_subtitle: "The beauty booking marketplace for braided styles. Real salons. Real people. Real results.", hero_image_url: "/images/braids-knotless.jpg", sections: [] });
  const { data: salonsData, error: salonsError } = await supabase
    .from("salons")
    .select("id,name,slug,neighborhood,address_city,rating_overall,review_count,cover_photo_url,badges,subscription_tier,verification_status")
    .order("review_count", { ascending: false })
    .limit(50);

  const availableSalons = (salonsData || []) as Salon[];
  const salons = availableSalons.filter(
    (salon) => (salon.review_count || 0) > 0 || (salon.rating_overall || 0) > 0 || Boolean(salon.cover_photo_url),
  );

  const salonIds = availableSalons.map((salon) => salon.id);
  const startingPrices: Record<string, number | null> = {};

  if (salonIds.length) {
    const { data: styleData } = await supabase
      .from("styles")
      .select("salon_id,price_display_min")
      .in("salon_id", salonIds);

    for (const salonId of salonIds) {
      const prices = ((styleData || []) as StylePrice[])
        .filter((style) => style.salon_id === salonId && typeof style.price_display_min === "number")
        .map((style) => style.price_display_min as number);
      startingPrices[salonId] = prices.length ? Math.min(...prices) : null;
    }
  }

  const nearbySalons = rankSalonsForNearbyDiscovery(availableSalons).slice(0, 4);
  const paidFeaturedPool = rankSalonsForNearbyDiscovery(salons.filter((salon) => getSubscriptionTierPriority(salon.subscription_tier) >= 2));
  const featuredSalons = (paidFeaturedPool.length ? paidFeaturedPool : salons).slice(0, 4);
  const socialProofLabels = [homeContent.labels?.social_proof_heading, homeContent.labels?.social_proof_subheading, homeContent.labels?.social_proof_note].filter(Boolean) as string[];

  return (
    <main className="min-h-screen overflow-x-clip bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-plum/[0.08] bg-[radial-gradient(circle_at_86%_30%,rgba(243,217,228,0.64),transparent_31%),linear-gradient(105deg,#fbf4ee_0%,#fffaf6_55%,#f7e6df_100%)]">
        <div className="relative mx-auto grid w-full max-w-[1760px] grid-cols-1 px-4 sm:px-6 lg:min-h-[326px] lg:grid-cols-[54%_46%] lg:px-10 xl:px-12 2xl:px-16">
          <div className="relative z-20 flex flex-col justify-center pb-6 pt-9 lg:pb-2 lg:pt-4">
            <p className="max-w-[235px] text-[9px] font-bold uppercase leading-[1.7] tracking-[0.14em] text-[#6c3f50] sm:text-[11px] lg:max-w-none">
              Real prices. Real reviews. <span className="text-magenta">♥</span><br />Real work. Real availability.
            </p>
            <h1 className="mt-3 max-w-[245px] font-serif text-[40px] font-semibold leading-[0.91] tracking-[-0.055em] text-[#2d1237] sm:text-[51px] lg:mt-2 lg:max-w-[610px] lg:text-[58px]">
              {homeContent.hero_title}
            </h1>
            <p className="mt-4 max-w-[245px] text-[13px] leading-[1.45] text-ink/75 sm:text-[15px] lg:mt-3 lg:max-w-[470px]">
              {homeContent.hero_subtitle}
            </p>

            <div className="relative z-30 mt-5 w-full max-w-[760px] lg:mt-4">
              <SearchComposer />
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 h-[225px] w-[53%] lg:inset-y-0 lg:h-auto lg:w-[52%]">
            <Image
              src={homeContent.hero_image_url || "/images/braids-knotless.jpg"}
              alt="Client wearing a long braided style"
              fill
              priority
              sizes="(max-width: 1023px) 53vw, 52vw"
              className="object-cover object-[44%_38%] lg:object-[48%_38%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#fffaf6] via-[#fffaf6]/30 to-transparent lg:inset-y-0 lg:left-0 lg:right-auto lg:w-1/3 lg:via-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-cream/80 to-transparent lg:h-20 lg:from-cream/70" />
          </div>

          {socialProofLabels.length ? <div className="absolute right-[3%] top-[49%] z-20 hidden w-[190px] rounded-[16px] bg-[linear-gradient(145deg,#35123b,#211027)] p-4 text-white shadow-[0_18px_40px_rgba(26,18,32,0.22)] lg:block">
            <Star size={18} className="text-amber" />
            {socialProofLabels.map((label, index) => <p key={label} className={index === 0 ? "mt-2 font-serif text-lg font-semibold" : "mt-1 text-[10px] leading-4 text-white/80"}>{label}</p>)}
          </div> : null}

        </div>
      </section>

      <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-10 xl:px-12 2xl:px-16">
        <section className="py-3 sm:py-5">
          <SectionHeading title="Salons Near You" description="Discover trusted braiders ready to book." href="/search" linkLabel="View all salons" />

          {salonsError ? (
            <div className="rounded-[16px] border border-plum/10 bg-white p-6 text-sm text-ink/70">Nearby salons are taking a quick beauty break. Try again shortly.</div>
          ) : (
            nearbySalons.length ? <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 lg:gap-4 [&::-webkit-scrollbar]:hidden">
              {nearbySalons.map((salon, index) => (
                <SalonCard key={salon.id} salon={salon} index={index} price={startingPrices[salon.id]} ctaLabel="View salon" prominent />
              ))}

            </div> : <MarketplaceEmpty title="No salons are listed yet" body="Approved salons will appear here as soon as they publish their profiles." />
          )}
        </section>

        <section className="pb-5 sm:pb-6">
          <SectionHeading title="Featured Salons" description="Handpicked top-rated salons near you." href="/search" linkLabel="View all salons" />

          {salonsError ? (
            <div className="rounded-[16px] border border-plum/10 bg-white p-6 text-sm text-ink/70">Featured salons are taking a quick beauty break. Try again shortly.</div>
          ) : (
            featuredSalons.length ? <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
              {featuredSalons.map((salon, index) => (
                <SalonCard key={salon.id} salon={salon} index={index} price={startingPrices[salon.id]} ctaLabel="View times" />
              ))}

            </div> : <MarketplaceEmpty title="No featured salons yet" body="Featured placements will appear after eligible salons are approved." />
          )}
        </section>

        <section id="how-it-works" className="mb-3 rounded-[16px] bg-[linear-gradient(105deg,#fff7f3,#f8e1e7)] px-4 py-4 sm:px-7 lg:grid lg:grid-cols-[200px_1fr] lg:items-center lg:gap-7">
          <h2 className="font-serif text-[22px] font-semibold tracking-[-0.03em] text-ink">How it works</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 lg:mt-0">
            {[
              { title: "Find", description: "Search styles or salons near you.", icon: Search },
              { title: "Book", description: "See real availability and prices.", icon: CalendarDays },
              { title: "Go", description: "Show up, slay, and leave a review.", icon: Heart },
            ].map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative flex flex-col items-center text-center sm:flex-row sm:text-left">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-magenta shadow-sm"><Icon size={23} strokeWidth={1.9} /></span>
                  <span className="mt-2 sm:ml-3 sm:mt-0">
                    <span className="block font-serif text-[16px] font-semibold text-ink">{step.title}</span>
                    <span className="mt-1 hidden max-w-[145px] text-[10px] leading-4 text-ink/60 sm:block">{step.description}</span>
                  </span>
                  {index < 2 ? <ArrowRight aria-hidden="true" size={16} className="absolute -right-2 top-4 hidden text-plum/35 lg:block" /> : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <TrustStrip />
      <PublicFooter />
      <CustomerBottomNav active="home" />
    </main>
  );
}

function MarketplaceEmpty({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[16px] border border-dashed border-plum/20 bg-white/60 px-6 py-9 text-center"><h3 className="font-serif text-xl text-plum">{title}</h3><p className="mt-2 text-sm text-ink/60">{body}</p></div>;
}
