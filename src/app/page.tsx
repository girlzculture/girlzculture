import { ArrowRight, CalendarDays, Heart, Search } from "lucide-react";
import { Fragment } from "react";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";
import SearchComposer from "@/components/site/SearchComposer";
import { getContentPage, type ContentCard } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";
import FeaturedSalonPlacement from "@/components/public/FeaturedSalonPlacement";
import TrendingVideoPlacement from "@/components/public/TrendingVideoPlacement";
import NearbySalonPlacement from "@/components/public/NearbySalonPlacement";
import { getEngineNumber } from "@/lib/engineConfigServer";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";
import {
  CustomerBottomNav,
  PublicFooter,
  PublicHeader,
  TrustStrip,
} from "@/components/site/PublicChrome";
import MobileLocationOnboarding from "@/components/location/MobileLocationOnboarding";
import FirstRelevantLocationRequest from "@/components/location/FirstRelevantLocationRequest";
import FeaturedProductPlacement from "@/components/public/FeaturedProductPlacement";
import HomepagePromoRail from "@/components/public/HomepagePromoRail";
import { resolvePublishedHomepagePromotions } from "@/lib/homepagePromotionServer";
import { homepageSearchInsertIndex } from "@/lib/homepageSectionOrderingCore";

type HomeSectionKey = "promo_rail" | "salons_near_you" | "featured_salons" | "featured_products" | "trending_now" | "trending_picks";
type HomeSection = { section_key: HomeSectionKey; title: string; description: string | null; is_visible: boolean; sort_order: number };
const DEFAULT_HOME_SECTIONS: HomeSection[] = [
  { section_key: "promo_rail", title: "Featured", description: null, is_visible: true, sort_order: 1 },
  { section_key: "salons_near_you", title: "Salons Near You", description: null, is_visible: true, sort_order: 2 },
  { section_key: "featured_salons", title: "Featured Salons", description: null, is_visible: true, sort_order: 3 },
  { section_key: "trending_picks", title: "Trending Picks This Week", description: null, is_visible: true, sort_order: 4 },
  { section_key: "featured_products", title: "Featured Products", description: "Reserve salon favorites for local pickup.", is_visible: true, sort_order: 5 },
  { section_key: "trending_now", title: "Trending Now", description: null, is_visible: false, sort_order: 6 },
];
const DEFAULT_PROMOTION_CARDS: ContentCard[] = [
  { id: "pilot-nearby", content_type: "image", title: "Find trusted salons nearby", body: "See verified braiding salons serving Harlem and the Bronx.", media_url: "/images/salon-warm.jpg", href: "/salons", cta_label: "Find a salon", alt_text: "Warm, modern braiding salon interior", status: "Active" },
  { id: "pilot-knotless", content_type: "image", title: "Knotless braids, clear prices", body: "Compare real service details before you reserve.", media_url: "/images/braids-knotless.jpg", href: "/styles?style=knotless-braids", cta_label: "Browse knotless", alt_text: "Client wearing knotless braids", status: "Active" },
  { id: "pilot-box", content_type: "image", title: "Explore box braids", body: "Choose a salon, stylist, length, and available time.", media_url: "/images/braids-box.jpg", href: "/styles?style=box-braids", cta_label: "Explore styles", alt_text: "Detailed box braid hairstyle", status: "Active" },
  { id: "pilot-cornrows", content_type: "image", title: "Cornrow specialists", body: "Discover local professionals and verified client reviews.", media_url: "/images/braids-cornrows.jpg", href: "/styles?style=cornrows", cta_label: "See specialists", alt_text: "Client wearing neat cornrows", status: "Active" },
  { id: "pilot-book", content_type: "image", title: "Reserve with confidence", body: "Secure an appointment with a clear reservation deposit.", media_url: "/images/hero-braids.jpg", href: "/salons", cta_label: "Book now", alt_text: "Client with a finished braided hairstyle", status: "Active" },
  { id: "pilot-how", content_type: "image", title: "How Girlz Culture works", body: "From discovery to a verified review, see every step.", media_url: "/images/salon-modern.jpg", href: "/how-it-works", cta_label: "How it works", alt_text: "Bright contemporary beauty salon", status: "Active" },
  { id: "pilot-partner", content_type: "image", title: "Built for salon owners", body: "Manage services, availability, bookings, and your public page.", media_url: "/images/salon-blush.jpg", href: "/partner", cta_label: "Partner with us", alt_text: "Blush-toned salon interior", status: "Active" },
  { id: "pilot-trust", content_type: "image", title: "Real work. Real reviews.", body: "Book from transparent salon profiles with verified feedback.", media_url: "/images/salon-dark.jpg", href: "/safety", cta_label: "Safety and trust", alt_text: "Premium dark-toned salon interior", status: "Active" },
];

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const previewQuery = await searchParams;
  const depthPreview = previewQuery.homepage3d === "1";
  const homeContent = await getContentPage("home", { slug: "home", title: "Home", hero_title: "Book with Confidence.", hero_subtitle: "", hero_image_url: "/images/braids-knotless.jpg", sections: [] });
  const { data: sectionData, error: sectionError } = await supabase.from("homepage_sections").select("*").order("sort_order");
  if (sectionError) await capturePublicPageFailure(sectionError, "homepage", "load-section-controls");
  const sectionOverrides = new Map(((sectionData || []) as HomeSection[]).map((section) => [section.section_key, section]));
  const homepageSections = DEFAULT_HOME_SECTIONS.map((section) => {
    const override = sectionOverrides.get(section.section_key);
    const merged = override || section;
    return {
      ...merged,
      description: ["salons_near_you", "featured_salons", "trending_picks"].includes(section.section_key)
        ? null
        : merged.description,
    };
  }).filter((section) => section.is_visible).sort((left, right) => left.sort_order - right.sort_order);
  const promoSection = homeContent.sections?.find((section) => section.type === "promo_rail" && section.is_visible !== false);
  const configuredPromotionCards = promoSection?.cards?.length ? promoSection.cards : DEFAULT_PROMOTION_CARDS;
  const promotionCards = await resolvePublishedHomepagePromotions(configuredPromotionCards);
  const contentSections = homeContent.sections?.filter((section) => section.type !== "promo_rail") || [];
  const [nearbyCardCount,featuredCardCount,productCardCount,trendingCardCount]=await Promise.all([getEngineNumber("homepage.nearby_card_count",6,1,24),getEngineNumber("homepage.featured_card_count",12,1,24),getEngineNumber("homepage.featured_product_card_count",12,1,24),getEngineNumber("homepage.trending_card_count",12,1,24)]);
  const searchInsertIndex = homepageSearchInsertIndex(homepageSections);

  return (
    <main data-homepage-variant={depthPreview ? "depth" : "standard"} className={`min-h-screen overflow-x-clip bg-cream pb-20 text-ink md:pb-0 ${depthPreview ? "gc-home-depth" : ""}`}>
      <PublicHeader />
      <FirstRelevantLocationRequest />
      <MobileLocationOnboarding />

      <div className="gc-home-content mx-auto w-full max-w-[1760px] px-4 pt-2 sm:px-6 sm:pt-3 lg:px-10 xl:px-12 2xl:px-16">
        {homepageSections.map((section, index) => (
          <Fragment key={section.section_key}>
            {index === searchInsertIndex ? <HomepageSearch /> : null}
            <HomepageRow section={section} promotionCards={promotionCards} nearbyCardCount={nearbyCardCount} featuredCardCount={featuredCardCount} productCardCount={productCardCount} trendingCardCount={trendingCardCount}/>
          </Fragment>
        ))}
        {searchInsertIndex === homepageSections.length ? <HomepageSearch /> : null}

        <PublicContentSections sections={contentSections} variant="homepage" />

        <section id="how-it-works" className="mb-3 rounded-[16px] bg-blush/70 px-4 py-4 sm:px-7 lg:grid lg:grid-cols-[200px_1fr] lg:items-center lg:gap-7">
          <h2 className="font-serif text-[22px] font-semibold tracking-[-0.03em] text-ink">How it works</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 lg:mt-0">
            {[
              { title: "Find", description: "Search styles or salons near you.", icon: Search },
              { title: "Book", description: "Choose an available time and review the price.", icon: CalendarDays },
              { title: "Go", description: "Attend your appointment and leave a review.", icon: Heart },
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

function HomepageRow({ section,promotionCards,nearbyCardCount,featuredCardCount,productCardCount,trendingCardCount }: { section: HomeSection;promotionCards:ContentCard[];nearbyCardCount:number;featuredCardCount:number;productCardCount:number;trendingCardCount:number }) {
  if (section.section_key === "promo_rail") return <HomepagePromoRail cards={promotionCards} now={new Date().toISOString()} />;
  if (section.section_key === "salons_near_you") return <NearbySalonPlacement title={section.title} description={section.description} maxCards={nearbyCardCount}/>;
  if (section.section_key === "featured_salons") return <FeaturedSalonPlacement title={section.title} description={section.description} maxCards={featuredCardCount}/>;
  if (section.section_key === "featured_products") return <FeaturedProductPlacement title={section.title} description={section.description} maxCards={productCardCount}/>;
  if (section.section_key === "trending_picks" || section.section_key === "trending_now") return <TrendingVideoPlacement title={section.title} description={section.description} maxCards={trendingCardCount}/>;
  return null;
}

function HomepageSearch() {
  return (
    <section data-home-search aria-label="Search Girlz Culture" className="pb-3 pt-1 sm:pb-4 sm:pt-2">
      <SearchComposer />
    </section>
  );
}
