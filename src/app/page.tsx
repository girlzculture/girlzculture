import Image from "next/image";
import { ArrowRight, CalendarDays, Heart, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";
import SearchComposer from "@/components/site/SearchComposer";
import { getContentPage } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";
import FeaturedSalonPlacement from "@/components/public/FeaturedSalonPlacement";
import TrendingVideoPlacement from "@/components/public/TrendingVideoPlacement";
import NearbySalonPlacement from "@/components/public/NearbySalonPlacement";
import {
  CustomerBottomNav,
  PublicFooter,
  PublicHeader,
  TrustStrip,
} from "@/components/site/PublicChrome";

type HomeSectionKey = "salons_near_you" | "featured_salons" | "trending_now" | "trending_picks";
type HomeSection = { section_key: HomeSectionKey; title: string; description: string | null; is_visible: boolean; sort_order: number };
const DEFAULT_HOME_SECTIONS: HomeSection[] = [
  { section_key: "salons_near_you", title: "Salons Near You", description: null, is_visible: true, sort_order: 1 },
  { section_key: "featured_salons", title: "Featured Salons", description: null, is_visible: true, sort_order: 2 },
  { section_key: "trending_now", title: "Trending Now", description: null, is_visible: false, sort_order: 3 },
  { section_key: "trending_picks", title: "Trending Picks This Week", description: null, is_visible: true, sort_order: 4 },
];

export default async function Home() {
  const homeContent = await getContentPage("home", { slug: "home", title: "Home", hero_title: "Book with Confidence.", hero_subtitle: "", hero_image_url: "/images/braids-knotless.jpg", sections: [] });
  const { data: sectionData, error: sectionError } = await supabase.from("homepage_sections").select("*").order("sort_order");
  if (sectionError) console.warn("Homepage section controls unavailable", sectionError.message);
  const sectionOverrides = new Map(((sectionData || []) as HomeSection[]).map((section) => [section.section_key, section]));
  const subtitleKeys: Record<HomeSectionKey, string> = { salons_near_you: "salons_near_you_subheading", featured_salons: "featured_salons_subheading", trending_now: "trending_now_subheading", trending_picks: "trending_picks_subheading" };
  const homepageSections = DEFAULT_HOME_SECTIONS.map((section) => {
    const override = sectionOverrides.get(section.section_key);
    return { ...(override || section), description: homeContent.labels?.[subtitleKeys[section.section_key]] || null };
  }).filter((section) => section.is_visible).sort((left, right) => left.sort_order - right.sort_order);
  const socialProofLabels = [homeContent.labels?.social_proof_heading, homeContent.labels?.social_proof_subheading, homeContent.labels?.social_proof_note].filter(Boolean) as string[];

  return (
    <main className="min-h-screen overflow-x-clip bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-plum/[0.08] bg-[radial-gradient(circle_at_86%_30%,rgba(243,217,228,0.64),transparent_31%),linear-gradient(105deg,#fbf4ee_0%,#fffaf6_55%,#f7e6df_100%)]">
        <div className="relative mx-auto grid w-full max-w-[1760px] grid-cols-1 px-4 sm:px-6 lg:min-h-[326px] lg:grid-cols-[54%_46%] lg:px-10 xl:px-12 2xl:px-16">
          <div className="relative z-20 flex flex-col justify-center pb-5 pt-6 lg:pb-2 lg:pt-4">
            <h1 className="max-w-[245px] font-serif text-[40px] font-semibold leading-[0.91] tracking-[-0.055em] text-[#2d1237] sm:text-[51px] lg:max-w-[610px] lg:text-[58px]">
              {homeContent.hero_title}
            </h1>
            {homeContent.hero_subtitle ? <p className="mt-3 max-w-[245px] text-[13px] leading-[1.45] text-ink/75 sm:text-[15px] lg:max-w-[470px]">
              {homeContent.hero_subtitle}
            </p> : null}

            <div className="relative z-30 mt-5 hidden w-full max-w-[760px] md:block lg:mt-4">
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
              style={{ objectPosition: `${Number(homeContent.hero_position_x ?? 44)}% ${Number(homeContent.hero_position_y ?? 38)}%`, transform: `scale(${Number(homeContent.hero_zoom ?? 1)})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#fffaf6] via-[#fffaf6]/30 to-transparent lg:inset-y-0 lg:left-0 lg:right-auto lg:w-1/3 lg:via-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-cream/80 to-transparent lg:h-20 lg:from-cream/70" />
          </div>

          {socialProofLabels.length ? <div className="absolute right-[3%] top-[49%] z-20 hidden w-[190px] rounded-[16px] bg-[linear-gradient(145deg,#35123b,#211027)] p-4 text-white shadow-[0_18px_40px_rgba(26,18,32,0.22)] lg:block">
            {socialProofLabels.map((label, index) => <p key={label} className={index === 0 ? "mt-2 font-serif text-lg font-semibold" : "mt-1 text-[10px] leading-4 text-white/80"}>{label}</p>)}
          </div> : null}

        </div>
      </section>

      <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-10 xl:px-12 2xl:px-16">
        {homepageSections.map((section) => <HomepageRow key={section.section_key} section={section} />)}

        <PublicContentSections sections={homeContent.sections} variant="homepage" />

        <section id="how-it-works" className="mb-3 rounded-[16px] bg-[linear-gradient(105deg,#fff7f3,#f8e1e7)] px-4 py-4 sm:px-7 lg:grid lg:grid-cols-[200px_1fr] lg:items-center lg:gap-7">
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

function HomepageRow({ section }: { section: HomeSection }) {
  if (section.section_key === "salons_near_you") return <NearbySalonPlacement title={section.title} description={section.description}/>;
  if (section.section_key === "featured_salons") return <FeaturedSalonPlacement title={section.title} description={section.description}/>;
  if (section.section_key === "trending_picks" || section.section_key === "trending_now") return <TrendingVideoPlacement title={section.title} description={section.description}/>;
  return null;
}
