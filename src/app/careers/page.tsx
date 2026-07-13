import Link from "next/link";
import { Heart, ShieldCheck, TrendingUp, UsersRound } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import SafeImage from "@/components/site/SafeImage";
import { getContentPage } from "@/lib/content";

export default async function Careers() {
  const page = await getContentPage("careers", {
    slug: "careers",
    title: "Careers",
    eyebrow: "CAREERS",
    hero_title: "Build the future of beauty with us.",
    hero_subtitle:
      "At Girlz Culture, we’re creating more than a marketplace—we’re building a movement. Join a passionate team empowering beauty professionals.",
    hero_image_url: "/images/hero-braids.jpg",
    sections: [],
  });
  const benefits = [
    [Heart, "Purpose-Driven", "Elevate beauty professionals and celebrate our culture."],
    [UsersRound, "Inclusive Culture", "Every voice at the table."],
    [TrendingUp, "Growth & Learning", "Mentorship and real opportunities."],
    [ShieldCheck, "Great Benefits", "Flexibility, wellness, and support."],
  ] as const;
  const roles = [
    ["Senior Full Stack Engineer", "Engineering · Remote (US)"],
    ["Product Manager", "Product · Atlanta, GA"],
    ["Growth Marketing Manager", "Marketing · Remote (US)"],
    ["Customer Experience Specialist", "Operations · Remote (US)"],
  ];

  return (
    <main className="bg-cream text-ink">
      <PublicHeader />
      <section className="mx-auto grid max-w-[1760px] items-center gap-6 px-5 py-9 md:grid-cols-[1fr_1.15fr] lg:px-14">
        <div>
          <p className="text-xs font-bold text-magenta">{page.eyebrow}</p>
          <h1 className="mt-3 font-serif text-5xl font-semibold leading-none text-plum sm:text-6xl">{page.hero_title}</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-ink/70">{page.hero_subtitle}</p>
          <Link href="#roles" className="mt-6 inline-flex rounded-lg bg-magenta px-6 py-3 text-sm font-bold text-white">View Open Roles</Link>
        </div>
        <SafeImage src={page.hero_image_url} fallbackSrc="/images/hero-braids.jpg" alt="Girlz Culture team" className="h-[390px] w-full rounded-[22px] object-cover" />
      </section>
      <section className="mx-auto max-w-[1600px] px-5 pb-8">
        <h2 className="text-center font-serif text-3xl text-plum">Why Work With Us</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {benefits.map(([Icon, title, body]) => (
            <article key={title} className="rounded-xl bg-blush/35 p-5">
              <Icon className="text-magenta" />
              <h3 className="mt-3 font-semibold text-plum">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-ink/60">{body}</p>
            </article>
          ))}
        </div>
        <section id="roles" className="mt-7">
          <div className="flex justify-between"><h2 className="font-serif text-3xl text-plum">Open Roles</h2><span className="text-sm text-magenta">View all openings</span></div>
          <div className="mt-4 divide-y divide-plum/10 rounded-[16px] border border-plum/10 bg-white">
            {roles.map(([title, meta]) => (
              <article key={title} className="flex items-center justify-between gap-4 p-4">
                <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs text-ink/55">{meta}</p></div>
                <span className="text-xs font-bold text-magenta">Details coming soon</span>
              </article>
            ))}
          </div>
        </section>
        <div className="mt-7 flex items-center justify-between rounded-[18px] bg-plum p-7 text-white">
          <div><h2 className="font-serif text-3xl">Ready to shape the future of beauty?</h2><p className="text-sm text-white/65">Explore open roles and find your place at Girlz Culture.</p></div>
          <a href="#roles" className="rounded-lg bg-magenta px-6 py-3 text-sm font-bold">View Open Roles</a>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
