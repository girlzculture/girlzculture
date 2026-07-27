"use client";

import AdminContentManager from "@/components/AdminContentManager";
import HomepagePromoRail from "@/components/public/HomepagePromoRail";
import type { ContentCard } from "@/lib/content";

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
    body: "Scheduled promotional content.",
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
  return (
    <main className="min-h-screen bg-cream py-6 text-ink">
      <div className="mx-auto mb-8 max-w-[1500px] px-4">
        <h1 className="font-serif text-4xl text-plum">
          Homepage promotion acceptance
        </h1>
      </div>
      <HomepagePromoRail cards={cards} now="2026-07-27T12:00:00.000Z" />
      <div className="mx-auto mt-10 max-w-[1500px] px-4">
        <AdminContentManager acceptanceAccessToken="acceptance-admin" />
      </div>
    </main>
  );
}
