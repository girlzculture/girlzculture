import Link from "next/link";
import { notFound } from "next/navigation";
import AboutStoryDialog from "@/components/public/AboutStoryDialog";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import PublicContentSections from "@/components/site/PublicContentSections";
import SafeImage from "@/components/site/SafeImage";
import { getContentPage, type ContentSection } from "@/lib/content";
import { resolvePublishedContentCards } from "@/lib/homepagePromotionServer";
import {
  ABOUT_CAROUSEL_ONE_EDITORIAL_FALLBACKS,
  ABOUT_CAROUSEL_ONE_ID,
  ABOUT_CAROUSEL_TWO_ID,
  findAboutCarouselSection,
} from "@/lib/contentSlotCore";

export const dynamic = "force-dynamic";

const ABOUT_ADDITIONAL_SLUG = "about-additional-content";

function findSection(sections: ContentSection[], ids: string[]) {
  return sections.find((section) => ids.includes(String(section.id || "")));
}

async function publishedCarousel(section?: ContentSection | null) {
  if (!section || section.is_visible === false) return undefined;
  return {
    ...section,
    cards: await resolvePublishedContentCards(
      Array.isArray(section.cards) ? section.cards : [],
    ),
  };
}

export default async function About() {
  const page = await getContentPage("about", {
    slug: "about",
    title: "About Us",
    eyebrow: "ABOUT US",
    hero_title: "Built for our culture. Backed by purpose.",
    hero_subtitle:
      "Girlz Culture connects you with skilled beauty professionals serving your community.",
    hero_image_url: "/images/hero-braids.jpg",
    labels: { read_more_label: "Read more" },
    sections: [
      {
        id: "about-story",
        type: "text",
        title: "Our Story",
        body: "Girlz Culture was created to make it easier to discover skilled beauty professionals, compare clear service information, and book with confidence. We are building practical tools that help clients make informed choices while helping salons reach, serve, and retain more customers.",
      },
    ],
  });
  if (!page) notFound();

  const sections = (page.sections || []).filter(
    (section) => section?.is_visible !== false,
  );
  const carousels = sections.filter(
    (section) => section.type === "community_carousel",
  );
  const story =
    findSection(sections, ["about-story", "our-story"]) ||
    sections.find((section) => section.type === "text");
  const communityCopy =
    findSection(sections, ["about-community-copy", "community-copy"]) ||
    sections.find((section) => section.type === "text" && section !== story);
  const middleSource =
    findSection(sections, [ABOUT_CAROUSEL_ONE_ID, "about-intro-carousel"]) ||
    carousels[0];
  const namedLowerSource = findSection(sections, [
    ABOUT_CAROUSEL_TWO_ID,
    "community-carousel",
  ]);
  const lowerSource =
    namedLowerSource && namedLowerSource !== middleSource
      ? namedLowerSource
      : carousels.find((section) => section !== middleSource);

  const excludedLegacy = new Set(
    [story, communityCopy, middleSource, lowerSource].filter(Boolean),
  );
  const legacyAdditional = sections.filter(
    (section) => !excludedLegacy.has(section),
  );

  const [carouselOnePage, carouselTwoPage, additionalPage] = await Promise.all([
    getContentPage("about-carousel-one", {
      slug: "about-carousel-one",
      title: "Promotional Carousel One",
      sections: middleSource ? [middleSource] : [],
    }),
    getContentPage("about-carousel-two", {
      slug: "about-carousel-two",
      title: "Promotional Carousel Two",
      sections: lowerSource ? [lowerSource] : [],
    }),
    getContentPage(ABOUT_ADDITIONAL_SLUG, {
      slug: ABOUT_ADDITIONAL_SLUG,
      title: "Additional About Content",
      sections: legacyAdditional,
    }),
  ]);

  const independentMiddle = carouselOnePage
    ? findAboutCarouselSection(carouselOnePage.sections, "one") || middleSource
    : null;
  const independentLower = carouselTwoPage
    ? findAboutCarouselSection(carouselTwoPage.sections, "two") ||
      findAboutCarouselSection(carouselTwoPage.sections, "one") ||
      lowerSource
    : null;
  const [
    resolvedIndependentMiddle,
    resolvedIndependentLower,
    resolvedLegacyMiddle,
    resolvedLegacyLower,
  ] = await Promise.all([
    publishedCarousel(independentMiddle),
    publishedCarousel(independentLower),
    publishedCarousel(middleSource),
    publishedCarousel(lowerSource),
  ]);

  const middleCards = resolvedIndependentMiddle?.cards?.length
    ? resolvedIndependentMiddle.cards
    : resolvedLegacyMiddle?.cards?.length
      ? resolvedLegacyMiddle.cards
      : ABOUT_CAROUSEL_ONE_EDITORIAL_FALLBACKS;
  const lowerCards = resolvedIndependentLower?.cards?.length
    ? resolvedIndependentLower.cards
    : resolvedLegacyLower?.cards || [];
  const middleBase = resolvedIndependentMiddle || resolvedLegacyMiddle;
  const lowerBase = resolvedIndependentLower || resolvedLegacyLower;
  const middleDirection: "forward" | "reverse" =
    middleBase?.scroll_direction === "forward" ? "forward" : "reverse";
  const oppositeDirection: "forward" | "reverse" =
    middleDirection === "forward" ? "reverse" : "forward";

  const middleCarousel = carouselOnePage
    ? {
        ...(middleBase || {
          type: "community_carousel" as const,
          title: "",
          is_visible: true,
        }),
        id: ABOUT_CAROUSEL_ONE_ID,
        cards: middleCards.slice(0, 8),
        scroll_direction: middleDirection,
      }
    : undefined;
  const lowerCarousel =
    carouselTwoPage && lowerCards.length
      ? {
          ...(lowerBase || {
            type: "community_carousel" as const,
            title: "",
            is_visible: true,
          }),
          id: ABOUT_CAROUSEL_TWO_ID,
          cards: lowerCards.slice(0, 8),
          scroll_direction:
            lowerBase?.scroll_direction &&
            lowerBase.scroll_direction !== middleDirection
              ? lowerBase.scroll_direction
              : oppositeDirection,
        }
      : undefined;
  const additionalSections = additionalPage?.sections || [];
  const storyTitle = String(story?.title || "Our Story");
  const storyBody = String(story?.body || page.hero_subtitle || "");

  return (
    <main className="min-h-screen bg-white text-ink">
      <PublicHeader active="about" />
      <section className="relative overflow-hidden bg-charcoal text-white">
        <div className="absolute inset-0 opacity-35">
          <SafeImage
            src={page.background_image_url}
            fallbackSrc="/images/salon-dark.jpg"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <div className="relative mx-auto grid min-h-[230px] max-w-[1760px] grid-cols-[1fr_.72fr] items-center gap-3 px-4 py-5 md:min-h-[430px] md:grid-cols-[1fr_.9fr] md:gap-8 md:px-5 md:py-10 lg:px-16">
          <div className="min-w-0">
            <p className="text-[9px] font-bold tracking-[.16em] text-amber md:text-xs">
              {page.eyebrow}
            </p>
            <h1 className="mt-2 max-w-3xl font-serif text-[34px] font-semibold leading-[.92] md:mt-4 md:text-7xl">
              {page.hero_title}
            </h1>
            <p className="mt-3 line-clamp-4 max-w-xl text-[11px] leading-4 text-white/80 md:mt-5 md:line-clamp-none md:text-sm md:leading-6">
              {page.hero_subtitle}
            </p>
            <AboutStoryDialog
              title={storyTitle}
              body={storyBody}
              label={String(page.labels?.read_more_label || "Read more")}
              className="mt-2 inline-flex min-h-10 items-center text-[11px] font-bold text-amber underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber md:mt-3 md:text-sm"
            />
            <div className="mt-4 flex flex-col gap-2 md:mt-6 md:flex-row md:gap-3">
              <Link
                href="/salons"
                className="rounded-lg bg-magenta px-4 py-2.5 text-center text-[11px] font-bold md:px-6 md:py-3 md:text-sm"
              >
                Find your salon
              </Link>
              <Link
                href="/partner"
                className="rounded-lg border border-white/50 px-4 py-2.5 text-center text-[11px] font-bold md:px-6 md:py-3 md:text-sm"
              >
                Partner with us
              </Link>
            </div>
          </div>
          <div className="h-[205px] min-w-0 overflow-hidden rounded-[18px] md:h-[330px] md:rounded-[24px]">
            <SafeImage
              src={page.hero_image_url}
              fallbackSrc="/images/hero-braids.jpg"
              alt="Girlz Culture community"
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${Number(page.hero_position_x ?? 50)}% ${Number(page.hero_position_y ?? 0)}%`,
                transform: `scale(${Number(page.hero_zoom ?? 1)})`,
              }}
            />
          </div>
        </div>
      </section>
      {middleCarousel ? (
        <PublicContentSections sections={[middleCarousel]} />
      ) : null}
      {lowerCarousel ? (
        <PublicContentSections sections={[lowerCarousel]} />
      ) : null}
      <PublicContentSections sections={additionalSections} />
      <PublicFooter />
    </main>
  );
}
