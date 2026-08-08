import Link from "next/link";
import AboutIntro from "@/components/public/AboutIntro";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import PublicContentSections from "@/components/site/PublicContentSections";
import SafeImage from "@/components/site/SafeImage";
import { getContentPage, type ContentSection } from "@/lib/content";
import { resolvePublishedContentCards } from "@/lib/homepagePromotionServer";

export const dynamic = "force-dynamic";

function findSection(sections: ContentSection[], ids: string[]) {
  return sections.find((section) => ids.includes(String(section.id || "")));
}

async function publishedCarousel(section?: ContentSection) {
  if (!section) return undefined;
  return { ...section, cards: await resolvePublishedContentCards(Array.isArray(section.cards) ? section.cards : []) };
}

export default async function About() {
  const page = await getContentPage("about", {
    slug: "about",
    title: "About Us",
    eyebrow: "ABOUT US",
    hero_title: "Built for our culture. Backed by purpose.",
    hero_subtitle: "Girlz Culture connects you with skilled beauty professionals serving your community.",
    hero_image_url: "/images/hero-braids.jpg",
    labels: { mobile_preview: "Learn why Girlz Culture was created for clients, salons, and the communities they serve.", read_more_label: "Read more" },
    sections: [
      { id: "about-story", type: "text", title: "Our Story", body: "Girlz Culture makes it easier to discover skilled beauty professionals, compare service details, and book with confidence while helping salons grow their businesses." },
      { id: "about-community-copy", type: "text", title: "Our Team. Our Community.", body: "We are building useful tools for clients and beauty professionals, shaped by the people who use them." },
    ],
  });

  const sections = (page.sections || []).filter((section) => section?.is_visible !== false);
  const carousels = sections.filter((section) => section.type === "community_carousel");
  const story = findSection(sections, ["about-story", "our-story"]) || sections.find((section) => section.type === "text");
  const communityCopy = findSection(sections, ["about-community-copy", "community-copy"]) || sections.find((section) => section.type === "text" && section !== story);
  const middleSource = findSection(sections, ["about-promo-carousel", "about-intro-carousel"]) || carousels[0];
  const namedLowerSource = findSection(sections, ["about-community-carousel", "community-carousel"]);
  const lowerSource = namedLowerSource && namedLowerSource !== middleSource ? namedLowerSource : carousels.find((section) => section !== middleSource);
  const [resolvedMiddle, resolvedLower] = await Promise.all([publishedCarousel(middleSource), publishedCarousel(lowerSource)]);
  const middleDirection: "forward" | "reverse" = resolvedMiddle?.scroll_direction === "forward" ? "forward" : "reverse";
  const oppositeDirection: "forward" | "reverse" = middleDirection === "forward" ? "reverse" : "forward";
  const middleCarousel = resolvedMiddle ? { ...resolvedMiddle, scroll_direction: middleDirection } : undefined;
  const lowerCarousel = resolvedLower
    ? { ...resolvedLower, scroll_direction: resolvedLower.scroll_direction && resolvedLower.scroll_direction !== middleDirection ? resolvedLower.scroll_direction : oppositeDirection }
    : undefined;
  const excluded = new Set([story, communityCopy, middleSource, lowerSource].filter(Boolean));
  const additionalSections = sections.filter((section) => !excluded.has(section));
  const storyBody = String(story?.body || page.hero_subtitle || "");
  const mobilePreview = String(page.labels?.mobile_preview || storyBody.split(/(?<=[.!?])\s+/)[0] || storyBody).slice(0, 240);

  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader active="about" />
    <section className="relative overflow-hidden bg-charcoal text-white">
      <div className="absolute inset-0 opacity-35"><SafeImage src={page.background_image_url} fallbackSrc="/images/salon-dark.jpg" alt="" className="h-full w-full object-cover" /></div>
      <div className="relative mx-auto grid min-h-[230px] max-w-[1760px] grid-cols-[1fr_.72fr] items-center gap-3 px-4 py-5 md:min-h-[430px] md:grid-cols-[1fr_.9fr] md:gap-8 md:px-5 md:py-10 lg:px-16">
        <div className="min-w-0">
          <p className="text-[9px] font-bold tracking-[.16em] text-amber md:text-xs">{page.eyebrow}</p>
          <h1 className="mt-2 max-w-3xl font-serif text-[34px] font-semibold leading-[.92] md:mt-4 md:text-7xl">{page.hero_title}</h1>
          <p className="mt-3 line-clamp-4 max-w-xl text-[11px] leading-4 text-white/80 md:mt-5 md:line-clamp-none md:text-sm md:leading-6">{page.hero_subtitle}</p>
          <div className="mt-4 flex flex-col gap-2 md:mt-6 md:flex-row md:gap-3">
            <Link href="/salons" className="rounded-lg bg-magenta px-4 py-2.5 text-center text-[11px] font-bold md:px-6 md:py-3 md:text-sm">Find your salon</Link>
            <Link href="/partner" className="rounded-lg border border-white/50 px-4 py-2.5 text-center text-[11px] font-bold md:px-6 md:py-3 md:text-sm">Partner with us</Link>
          </div>
        </div>
        <div className="h-[205px] min-w-0 overflow-hidden rounded-[18px] md:h-[330px] md:rounded-[24px]"><SafeImage src={page.hero_image_url} fallbackSrc="/images/hero-braids.jpg" alt="Girlz Culture community" className="h-full w-full object-cover" style={{ objectPosition: `${Number(page.hero_position_x ?? 50)}% ${Number(page.hero_position_y ?? 0)}%`, transform: `scale(${Number(page.hero_zoom ?? 1)})` }} /></div>
      </div>
    </section>

    <AboutIntro title={String(story?.title || "Our Story")} preview={mobilePreview} body={storyBody} readMoreLabel={String(page.labels?.read_more_label || "Read more")}/>
    {middleCarousel ? <PublicContentSections sections={[middleCarousel]}/> : null}
    {communityCopy ? <section className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-8"><h2 className="font-serif text-3xl font-semibold text-plum">{communityCopy.title}</h2>{communityCopy.body ? <p className="mt-3 max-w-3xl text-sm leading-7 text-ink/70">{communityCopy.body}</p> : null}</section> : null}
    {lowerCarousel ? <PublicContentSections sections={[lowerCarousel]}/> : null}
    <PublicContentSections sections={additionalSections}/>
    <PublicFooter/>
  </main>;
}
