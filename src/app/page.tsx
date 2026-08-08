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
import { HOMEPAGE_EDITORIAL_FALLBACKS } from "@/lib/homePromotionCore";

type HomeSectionKey = "promo_rail" | "salons_near_you" | "featured_salons" | "featured_products" | "trending_now" | "trending_picks";
type HomeSection = { section_key: HomeSectionKey; title: string; description: string | null; is_visible: boolean; sort_order: number };
const PUBLIC_HOME_SECTION_TIMEOUT_MS = 2_500;
const DEFAULT_HOME_SECTIONS: HomeSection[] = [
  { section_key: "promo_rail", title: "Featured", description: null, is_visible: true, sort_order: 1 },
  { section_key: "salons_near_you", title: "Salons Near You", description: null, is_visible: true, sort_order: 2 },
  { section_key: "featured_salons", title: "Featured Salons", description: null, is_visible: true, sort_order: 3 },
  { section_key: "trending_picks", title: "Trending Picks This Week", description: null, is_visible: true, sort_order: 4 },
  { section_key: "featured_products", title: "Featured Products", description: "Reserve salon favorites for local pickup.", is_visible: true, sort_order: 5 },
  { section_key: "trending_now", title: "Trending Now", description: null, is_visible: false, sort_order: 6 },
];
async function loadHomepageSections() {
  try {
    const { data, error } = await supabase
      .from("homepage_sections")
      .select("*")
      .order("sort_order")
      .abortSignal(AbortSignal.timeout(PUBLIC_HOME_SECTION_TIMEOUT_MS));
    if (error) throw error;
    return (data || []) as HomeSection[];
  } catch (error) {
    await capturePublicPageFailure(
      error,
      "homepage",
      "load-section-controls",
    );
    // Section order is an enhancement layer. The approved default order keeps
    // the public homepage usable if this nonessential lookup is slow.
    return [] as HomeSection[];
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const previewQuery = await searchParams;
  const depthPreview = previewQuery.homepage3d === "1";
  const [homeContent, sectionData] = await Promise.all([
    getContentPage("home", { slug: "home", title: "Home", hero_title: "Book with Confidence.", hero_subtitle: "", hero_image_url: "/images/braids-knotless.jpg", sections: [] }),
    loadHomepageSections(),
  ]);
  const sectionOverrides = new Map(sectionData.map((section) => [section.section_key, section]));
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
  const configuredPromotionCards = promoSection?.cards?.length ? promoSection.cards : HOMEPAGE_EDITORIAL_FALLBACKS;
  const [promotionCards, cardCounts] = await Promise.all([
    resolvePublishedHomepagePromotions(
      configuredPromotionCards,
      undefined,
      promoSection?.display_limit || 8,
    ),
    Promise.all([
      getEngineNumber("homepage.nearby_card_count",6,1,24),
      getEngineNumber("homepage.featured_card_count",12,1,24),
      getEngineNumber("homepage.featured_product_card_count",12,1,24),
      getEngineNumber("homepage.trending_card_count",12,1,24),
    ]),
  ]);
  const [nearbyCardCount, featuredCardCount, productCardCount, trendingCardCount] = cardCounts;
  const contentSections = homeContent.sections?.filter((section) => section.type !== "promo_rail") || [];
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
      <PublicFooter reserveMobileNavigation />
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
    <section data-home-search aria-label="Search Girlz Culture" className="gc-desktop-home-search pb-3 pt-1 sm:pb-4 sm:pt-2">
      <SearchComposer />
    </section>
  );
}
