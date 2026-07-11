import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import StyleCatalog, { StyleCatalogItem } from "@/components/public/StyleCatalog";
import { supabase } from "@/lib/supabase";

const fallback: StyleCatalogItem[] = [
  { name: "Knotless Braids", count: 180, image: "/images/braids-knotless.jpg", length: "Waist", maintenance: "Low", price: 180 },
  { name: "Box Braids", count: 210, image: "/images/braids-box.jpg", length: "Mid-back", maintenance: "Low", price: 160 },
  { name: "Cornrows", count: 160, image: "/images/braids-cornrows.jpg", length: "Shoulder", maintenance: "Medium", price: 120 },
  { name: "Locs", count: 130, image: "/images/hero-braids.jpg", length: "Mid-back", maintenance: "Medium", price: 150 },
  { name: "Goddess Locs", count: 120, image: "/images/hero-braids.jpg", length: "Waist", maintenance: "High", price: 220 },
  { name: "Feed-in Braids", count: 150, image: "/images/braids-cornrows.jpg", length: "Mid-back", maintenance: "Low", price: 140 },
  { name: "Boho Braids", count: 140, image: "/images/braids-box.jpg", length: "Waist", maintenance: "High", price: 240 },
  { name: "Twists", count: 110, image: "/images/braids-knotless.jpg", length: "Shoulder", maintenance: "Medium", price: 130 },
];

export default async function StylesPage() {
  const { data } = await supabase.from("styles").select("name, salon_id, price_display_min");
  const liveCounts = new Map<string, { salons: Set<string>; price: number }>();
  for (const row of data || []) {
    const name = typeof row.name === "string" ? row.name : "";
    if (!name) continue;
    const current = liveCounts.get(name) || { salons: new Set<string>(), price: Number(row.price_display_min || 0) };
    if (row.salon_id) current.salons.add(row.salon_id);
    liveCounts.set(name, current);
  }
  const items = fallback.map((item) => ({ ...item, count: Math.max(item.count, liveCounts.get(item.name)?.salons.size || 0), price: liveCounts.get(item.name)?.price || item.price }));

  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
    <PublicHeader active="styles" />
    <section className="relative overflow-hidden border-b border-plum/10 bg-[radial-gradient(circle_at_75%_25%,rgba(224,163,78,0.16),transparent_34%)]">
      <div className="mx-auto w-full max-w-[1760px] px-4 pb-6 pt-8 sm:px-8 lg:px-12 lg:pt-12 2xl:px-16">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9c431d]">Explore. Compare. Book with confidence.</p>
        <h1 className="mt-2 font-serif text-[42px] font-semibold leading-[0.95] tracking-[-0.045em] text-ink sm:text-[58px]">Browse by Style<span className="text-magenta">.</span></h1>
        <p className="mt-2 text-lg text-ink/80">Find your next look.</p>
        <div className="mt-5"><StyleCatalog items={items} /></div>
        <div className="mt-4 flex items-center justify-between rounded-[12px] bg-blush/50 px-4 py-3 text-[11px]"><span>✨ Tap a style to explore salons near you that specialize in that look.</span><span className="hidden font-semibold text-magenta sm:block">New styles added daily.</span></div>
      </div>
    </section>
    <PublicFooter />
    <CustomerBottomNav active="search" />
  </main>;
}
