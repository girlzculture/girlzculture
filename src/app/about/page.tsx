import Link from "next/link";
import { Heart, Landmark, ShieldCheck, UsersRound } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import SafeImage from "@/components/site/SafeImage";
import { getContentPage } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";

export const dynamic = "force-dynamic";

export default async function About() {
  const page = await getContentPage("about", {
    slug: "about",
    title: "About Us",
    eyebrow: "ABOUT US",
    hero_title: "Built for our culture. Backed by purpose.",
    hero_subtitle:
      "Girlz Culture connects you with trusted salons specializing in braided styles — celebrating our beauty, our heritage, and our community.",
    hero_image_url: "/images/hero-braids.jpg",
    sections: [
      {
        title: "Our Story",
        body: "Girlz Culture was born from a simple truth: braided beauty is more than a style — it’s a legacy. We created a platform that makes it effortless to discover talented braid specialists, book with confidence, and support the professionals who keep our culture thriving.",
      },
      {
        title: "Our Team. Our Community.",
        body: "We’re a passionate team of beauty lovers, builders, and culture champions. Together with our community of stylists and clients, we’re building a movement.",
      },
    ],
  });

  const values = [
    [ShieldCheck, "Transparency", "Clear pricing, honest information, and no surprises."],
    [Heart, "Trust", "Verified salons, booking-based reviews, and secure bookings."],
    [Landmark, "Celebrating Braiding Culture", "Honoring tradition and elevating our heritage."],
    [UsersRound, "Empowering Salons", "Tools and visibility to help braid pros grow."],
  ] as const;
  const sections = page.sections || [];
  const story = sections[0];
  const communityCopy = sections[1];
  const communityCarousel = sections.find((section) => section.type === "community_carousel");
  const additionalSections = sections.filter((section, index) => index > 1 && section !== communityCarousel);

  return (
    <main className="min-h-screen bg-cream text-ink">
      <PublicHeader active="about" />
      <section className="relative overflow-hidden bg-[#321035] text-white">
        <div className="absolute inset-0 opacity-35">
          <SafeImage src={page.background_image_url} fallbackSrc="/images/salon-dark.jpg" alt="" className="h-full w-full object-cover" />
        </div>
        <div className="relative mx-auto grid min-h-[430px] max-w-[1760px] items-center gap-8 px-5 py-10 md:grid-cols-[1fr_.9fr] lg:px-16">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-amber">{page.eyebrow}</p>
            <h1 className="mt-4 max-w-3xl font-serif text-5xl font-semibold leading-[.96] sm:text-7xl">{page.hero_title}</h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/80">{page.hero_subtitle}</p>
            <div className="mt-6 flex gap-3">
              <Link href="/salons" className="rounded-lg bg-magenta px-6 py-3 text-sm font-bold">Find your salon</Link>
              <Link href="/partner" className="rounded-lg border border-white/50 px-6 py-3 text-sm font-bold">Partner with us</Link>
            </div>
          </div>
          <div className="h-[330px] overflow-hidden rounded-[24px]"><SafeImage src={page.hero_image_url} fallbackSrc="/images/hero-braids.jpg" alt="Girlz Culture community" className="h-full w-full object-cover" style={{ objectPosition: `${Number(page.hero_position_x ?? 50)}% ${Number(page.hero_position_y ?? 0)}%`, transform: `scale(${Number(page.hero_zoom ?? 1)})` }} /></div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1600px] gap-6 px-5 py-8 lg:grid-cols-[.85fr_1.15fr]">
        <div>
          <h2 className="font-serif text-3xl font-semibold text-plum">{story?.title}</h2>
          <p className="mt-3 text-sm leading-7 text-ink/70">{story?.body}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {values.map(([Icon, title, body]) => (
            <article key={title} className="rounded-[16px] bg-blush/35 p-5 text-center">
              <Icon className="mx-auto text-magenta" />
              <h3 className="mt-3 font-serif text-lg text-plum">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-ink/65">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {communityCopy ? <section className="mx-auto max-w-[1600px] px-5 pt-2"><h2 className="font-serif text-3xl font-semibold text-plum">{communityCopy.title}</h2>{communityCopy.body ? <p className="mt-3 max-w-3xl text-sm leading-7 text-ink/70">{communityCopy.body}</p> : null}</section> : null}
      {communityCarousel ? <PublicContentSections sections={[communityCarousel]} /> : null}
      <PublicContentSections sections={additionalSections} />
      <PublicFooter />
    </main>
  );
}
