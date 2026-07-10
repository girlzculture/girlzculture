import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Heart, Search, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SearchComposer from "@/components/site/SearchComposer";
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
};

type StylePrice = {
  salon_id: string | null;
  price_display_min: number | null;
};

const styleTiles = [
  { name: "Knotless Braids", shortName: "Knotless\nBraids", count: "120+ salons", image: "/images/braids-cornrows.jpg", position: "50% 30%" },
  { name: "Box Braids", shortName: "Box\nBraids", count: "150+ salons", image: "/images/braids-box.jpg", position: "50% 68%" },
  { name: "Cornrows", shortName: "Cornrows", count: "110+ salons", image: "/images/hero-braids.jpg", position: "50% 30%" },
  { name: "Locs", shortName: "Locs", count: "80+ salons", image: "/images/braids-knotless.jpg", position: "48% 36%" },
];

const salonFallbackImages = [
  "/images/salon-blush.jpg",
  "/images/salon-modern.jpg",
  "/images/salon-warm.jpg",
  "/images/salon-dark.jpg",
];

function formatRating(value: number | null) {
  return typeof value === "number" && value > 0 ? value.toFixed(1) : "New";
}

export default async function Home() {
  const { data: salonsData, error: salonsError } = await supabase
    .from("salons")
    .select("id,name,slug,neighborhood,address_city,rating_overall,review_count,cover_photo_url,badges")
    .order("review_count", { ascending: false })
    .limit(12);

  const salons = ((salonsData || []) as Salon[]).filter(
    (salon) => (salon.review_count || 0) > 0 || (salon.rating_overall || 0) > 0 || Boolean(salon.cover_photo_url),
  );

  const salonIds = salons.map((salon) => salon.id);
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

  const featuredSalons = salons.slice(0, 4);
  const heroSalon = featuredSalons[0];
  const heroRating = heroSalon?.rating_overall || 4.9;
  const heroReviewCount = heroSalon?.review_count || 128;

  return (
    <main className="min-h-screen overflow-x-clip bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-plum/[0.08] bg-[radial-gradient(circle_at_86%_30%,rgba(243,217,228,0.64),transparent_31%),linear-gradient(105deg,#fbf4ee_0%,#fffaf6_55%,#f7e6df_100%)]">
        <div className="relative mx-auto grid w-full max-w-[1360px] grid-cols-1 px-4 sm:px-6 lg:min-h-[326px] lg:grid-cols-[54%_46%] lg:px-10 xl:px-12">
          <div className="relative z-20 flex flex-col justify-center pb-6 pt-9 lg:pb-2 lg:pt-4">
            <p className="max-w-[235px] text-[9px] font-bold uppercase leading-[1.7] tracking-[0.14em] text-[#6c3f50] sm:text-[11px] lg:max-w-none">
              Real prices. Real reviews. <span className="text-magenta">♥</span><br />Real work. Real availability.
            </p>
            <h1 className="mt-3 max-w-[245px] font-serif text-[40px] font-semibold leading-[0.91] tracking-[-0.055em] text-[#2d1237] sm:text-[51px] lg:mt-2 lg:max-w-[610px] lg:text-[58px]">
              Book with<br />Confidence<span className="text-magenta">.</span>
            </h1>
            <p className="mt-4 max-w-[245px] text-[13px] leading-[1.45] text-ink/75 sm:text-[15px] lg:mt-3 lg:max-w-[470px]">
              The beauty booking marketplace for braided styles.<br className="hidden sm:block" /><span className="hidden sm:inline"> Real salons. Real people. Real results.</span>
            </p>

            <div className="relative z-30 mt-5 w-full max-w-[760px] lg:mt-4">
              <SearchComposer />
            </div>
          </div>

          <div className="pointer-events-none absolute right-0 top-0 h-[225px] w-[53%] lg:inset-y-0 lg:h-auto lg:w-[52%]">
            <Image
              src="/images/braids-knotless.jpg"
              alt="Client wearing a long braided style"
              fill
              priority
              sizes="(max-width: 1023px) 53vw, 52vw"
              className="object-cover object-[44%_38%] lg:object-[48%_38%]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#fffaf6] via-[#fffaf6]/30 to-transparent lg:inset-y-0 lg:left-0 lg:right-auto lg:w-1/3 lg:via-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-cream/80 to-transparent lg:h-20 lg:from-cream/70" />
          </div>

          <div className="absolute right-[3%] top-[49%] z-20 hidden w-[168px] rounded-[16px] bg-[linear-gradient(145deg,#35123b,#211027)] p-4 text-white shadow-[0_18px_40px_rgba(26,18,32,0.22)] lg:block">
            <div className="text-[14px] font-bold text-amber">★★★★★ <span className="ml-1 text-white">{heroRating.toFixed(1)}</span></div>
            <div className="mt-1 text-[11px] text-white/80">{heroReviewCount.toLocaleString()}+ reviews</div>
            <div className="mt-3 flex -space-x-2">
              {["braids-cornrows.jpg", "braids-box.jpg", "hero-braids.jpg"].map((image) => (
                <span key={image} className="relative h-7 w-7 overflow-hidden rounded-full border-2 border-[#35123b]">
                  <Image src={`/images/${image}`} alt="" fill sizes="28px" className="object-cover" />
                </span>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-white/85">Real reviews from real clients</p>
          </div>

        </div>
      </section>

      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-10 xl:px-12">
        <section className="py-2 sm:py-3 lg:py-2">
          <SectionHeading title="Browse by Style" href="/search" linkLabel="View all styles" />
          <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-5 lg:gap-4">
            {styleTiles.map((style) => (
              <Link
                key={style.name}
                href={`/search?style=${encodeURIComponent(style.name)}`}
                className="group relative h-[128px] overflow-hidden rounded-[12px] bg-plum sm:h-[160px] lg:h-[145px]"
              >
                <Image src={style.image} alt={`${style.name} style`} fill sizes="(max-width: 640px) 50vw, 20vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" style={{ objectPosition: style.position }} />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
                  <h3 className="whitespace-pre-line font-serif text-[14px] font-semibold leading-[0.92] sm:text-[20px]">{style.shortName}</h3>
                  <p className="mt-1 hidden text-[9px] text-white/80 sm:block sm:text-[10px]">{style.count}</p>
                </div>
              </Link>
            ))}
            <Link href="/search" className="group relative hidden h-[145px] items-center justify-center overflow-hidden rounded-[12px] bg-[radial-gradient(circle_at_50%_35%,#5b1a6b,#25102d_70%)] text-center text-white lg:flex">
              <div>
                <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-amber/40 text-amber"><Sparkles aria-hidden="true" size={21} /></span>
                <h3 className="mt-3 font-serif text-[19px] font-semibold leading-[0.95]">Explore<br />All Styles</h3>
                <p className="mt-2 inline-flex items-center gap-1 text-[9px] text-white/75">See everything <ArrowRight size={11} /></p>
              </div>
            </Link>
          </div>
        </section>

        <section className="pb-5 sm:pb-6">
          <SectionHeading title="Featured Salons" description="Handpicked top-rated salons near you." href="/search" linkLabel="View all salons" />

          {salonsError ? (
            <div className="rounded-[16px] border border-plum/10 bg-white p-6 text-sm text-ink/70">Featured salons are taking a quick beauty break. Try again shortly.</div>
          ) : (
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
              {featuredSalons.map((salon, index) => {
                const price = startingPrices[salon.id];
                const image = salon.cover_photo_url || salonFallbackImages[index % salonFallbackImages.length];
                return (
                  <article key={salon.id} className="w-[72vw] max-w-[280px] shrink-0 snap-start overflow-hidden rounded-[14px] border border-plum/10 bg-[#fffdfa] shadow-[0_4px_16px_rgba(26,18,32,0.06)] sm:w-auto sm:max-w-none">
                    <Link href={`/salon/${salon.slug}`} className="group block">
                      <div className="relative h-[112px] overflow-hidden bg-blush lg:h-[98px]">
                        <Image src={image} alt={`${salon.name || "Salon"} interior`} fill sizes="(max-width: 640px) 72vw, 25vw" className="object-cover transition duration-500 group-hover:scale-[1.02]" />
                        <span className="absolute left-3 top-3 rounded-full bg-plum/95 px-3 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-white">Verified</span>
                        <span className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-ink shadow-sm backdrop-blur"><Heart size={17} /></span>
                      </div>
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-serif text-[15px] font-semibold leading-tight text-ink">{salon.name || "Salon"}</h3>
                            <p className="mt-1 text-[10px] text-ink/55">{salon.neighborhood || salon.address_city || "New York"}</p>
                          </div>
                          <p className="shrink-0 text-[10px] text-ink/60"><span className="text-amber">★</span> {formatRating(salon.rating_overall)} <span>({salon.review_count || 0})</span></p>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-plum/10 pt-2">
                          <p className="text-[10px] text-ink/55">From <strong className="font-serif text-[17px] text-ink">{price ? `$${price}` : "—"}</strong></p>
                          <span className="rounded-[8px] border border-magenta px-3 py-1.5 text-[9px] font-bold text-magenta">View times</span>
                        </div>
                      </div>
                    </Link>
                  </article>
                );
              })}

              {Array.from({ length: Math.max(0, 4 - featuredSalons.length) }, (_, index) => (
                <article key={`joining-${index}`} className="flex min-h-[184px] w-[72vw] max-w-[280px] shrink-0 snap-start flex-col items-center justify-center rounded-[14px] border border-dashed border-plum/20 bg-blush/20 p-5 text-center sm:w-auto sm:max-w-none">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-magenta shadow-sm"><Sparkles size={22} /></span>
                  <h3 className="mt-4 font-serif text-[19px] font-semibold text-plum">New salons joining soon</h3>
                  <p className="mt-2 text-[11px] leading-5 text-ink/60">We are carefully onboarding trusted braiders near you.</p>
                </article>
              ))}
            </div>
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
