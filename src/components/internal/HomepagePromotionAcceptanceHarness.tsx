"use client";

import { useState } from "react";
import AdminContentManager from "@/components/AdminContentManager";
import HomepagePromoRail from "@/components/public/HomepagePromoRail";
import AboutIntro from "@/components/public/AboutIntro";
import AutoContentCarousel from "@/components/site/AutoContentCarousel";
import type { ContentCard } from "@/lib/content";
import { homepagePromotionPreview } from "@/lib/homePromotionCore";

const GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const cards: ContentCard[] = [
  {
    id: "gif-card",
    title: "Animated launch card",
    body: "The animation remains a GIF in the responsive card.",
    cta_label: "Open salon",
    href: "/salon/eligible-salon",
    media_url: GIF,
    alt_text: "Animated Girlz Culture promotional card",
    status: "Active" as const,
  },
  ...Array.from({ length: 7 }, (_, index) => ({
    id: `active-${index + 2}`,
    title: index === 0 ? "Paid campaign destination" : `Active card ${index + 2}`,
    body: index === 0 ? "" : "Scheduled promotional content.",
    cta_label: "Explore",
    href:
      index === 0
        ? "/salon/campaign-salon?campaign=campaign-1"
        : `/styles?promotion=${index + 2}`,
    media_url: "/images/hero-braids.jpg",
    alt_text: `Active promotion ${index + 2}`,
    status: "Active" as const,
  })),
  {
    id: "expired-card",
    title: "Expired card must stay hidden",
    body: "Expired",
    media_url: "/images/hero-braids.jpg",
    status: "Active",
    ends_at: "2026-07-26T00:00:00.000Z",
  },
  {
    id: "draft-card",
    title: "Draft card must stay hidden",
    body: "Draft",
    media_url: "/images/hero-braids.jpg",
    status: "Draft" as const,
  },
];

export default function HomepagePromotionAcceptanceHarness() {
  const sixSaved = homepagePromotionPreview(cards.slice(0, 6), Date.parse("2026-07-27T12:00:00.000Z"), 8);
  const eightSaved = homepagePromotionPreview(cards.slice(0, 8), Date.parse("2026-07-27T12:00:00.000Z"), 8);
  const aboutOne = cards.slice(0, 3).map((card, index) => ({ ...card, id: `about-one-${index}`, href: `/about/one/${index}` }));
  const aboutTwo = cards.slice(3, 6).map((card, index) => ({ ...card, id: `about-two-${index}`, href: `/about/two/${index}` }));
  return (
    <main className="min-h-screen bg-cream py-6 text-ink">
      <div className="mx-auto mb-8 max-w-[1500px] px-4">
        <h1 className="font-serif text-4xl text-plum">
          Homepage promotion acceptance
        </h1>
      </div>
      <HomepagePromoRail cards={cards} now="2026-07-27T12:00:00.000Z" />
      <ScheduleBoundaryHarness />
      <section className="mx-auto max-w-[1500px] px-4" aria-label="Promotion composition evidence">
        <div data-testid="promotion-composition-six" data-saved-count={sixSaved.saved.length} data-fallback-count={sixSaved.fallbackCount} data-effective-ids={sixSaved.effective.map((card) => card.id).join(",")}/>
        <div data-testid="promotion-composition-eight" data-saved-count={eightSaved.saved.length} data-fallback-count={eightSaved.fallbackCount} data-effective-ids={eightSaved.effective.map((card) => card.id).join(",")}/>
      </section>
      <AboutIntro title="Our Story" preview="A compact mobile introduction." body="Girlz Culture was built to connect clients and beauty professionals through clear services, real availability, and trusted work. This complete story remains available in an accessible mobile dialog." readMoreLabel="Read more"/>
      <section className="mx-auto max-w-[1500px] px-4" aria-label="About carousel acceptance">
        <AutoContentCarousel cards={aboutOne} direction="reverse" label="About carousel one" sectionId="about-promo-carousel"/>
        <AutoContentCarousel cards={aboutTwo} direction="forward" label="About carousel two" sectionId="about-community-carousel"/>
      </section>
      <div className="mx-auto mt-10 max-w-[1500px] px-4">
        <AdminContentManager acceptanceAccessToken="acceptance-admin" initialRecordId="page-home--hero-promotion-carousel" />
      </div>
    </main>
  );
}

function ScheduleBoundaryHarness() {
  const [fixture] = useState(() => {
    const createdAt = Date.now();
    return {
      now: new Date(createdAt).toISOString(),
      cards: [
        {
          id: "schedule-baseline",
          title: "Schedule baseline card",
          body: "Remains visible throughout the boundary test.",
          href: "/styles",
          cta_label: "Browse styles",
          alt_text: "Braided hairstyle schedule baseline fixture",
          media_url: "/images/hero-braids.jpg",
          status: "Active" as const,
        },
        {
          id: "schedule-boundary",
          title: "Schedule boundary card",
          body: "Appears and expires without a page refresh.",
          href: "/salons",
          cta_label: "Find salons",
          alt_text: "Braided hairstyle schedule boundary fixture",
          media_url: "/images/hero-braids.jpg",
          status: "Active" as const,
          starts_at: new Date(createdAt + 2_000).toISOString(),
          ends_at: new Date(createdAt + 4_500).toISOString(),
        },
      ] satisfies ContentCard[],
    };
  });
  return (
    <section data-testid="promotion-schedule-boundary" className="mt-4">
      <HomepagePromoRail cards={fixture.cards} now={fixture.now} />
    </section>
  );
}
