import { Compass } from "lucide-react";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import StyleCatalog, { StyleCatalogItem } from "@/components/public/StyleCatalog";
import { supabase } from "@/lib/supabase";

type StyleRow = {
  name?: string | null;
  category?: string | null;
  category_id?: string | null;
  service_category?: { name?: string | null; slug?: string | null } | null;
  salon_id?: string | null;
  price_display_min?: number | null;
  base_price?: number | null;
  photos?: string[] | null;
  length_options?: Array<{ label?: string }> | null;
};

export const dynamic = "force-dynamic";

export default async function StylesPage() {
  const { data, error } = await supabase
    .from("styles")
    .select("name,category,category_id,salon_id,price_display_min,base_price,photos,length_options,service_category:service_categories(name,slug)")
    .is("archived_at", null)
    .order("name");

  if (error) console.error("Unable to load public style catalog", error);

  const grouped = new Map<string, StyleCatalogItem & { salons: Set<string> }>();
  for (const raw of (data || []) as StyleRow[]) {
    const name = raw.name?.trim();
    if (!name) continue;
    const category = raw.service_category?.name || "Braiding";
    const categorySlug = raw.service_category?.slug || "braiding";
    const key = `${categorySlug}:${name.toLocaleLowerCase()}`;
    const price = Number(raw.price_display_min || raw.base_price || 0);
    const existing = grouped.get(key) || {
      name,
      category,
      categorySlug,
      count: 0,
      salons: new Set<string>(),
      image: raw.photos?.[0] || "",
      length: raw.length_options?.[0]?.label,
      price: price > 0 ? price : undefined,
    };
    if (raw.salon_id) existing.salons.add(raw.salon_id);
    if (!existing.image && raw.photos?.[0]) existing.image = raw.photos[0];
    if ((!existing.price || price < existing.price) && price > 0) existing.price = price;
    grouped.set(key, existing);
  }

  const items = Array.from(grouped.values())
    .map(({ salons, ...item }) => ({ ...item, count: salons.size }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 24);

  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
    <PublicHeader active="styles" />
    <section className="relative overflow-hidden border-b border-plum/10 bg-[radial-gradient(circle_at_75%_25%,rgba(224,163,78,0.16),transparent_34%)]">
      <div className="mx-auto w-full max-w-[1760px] px-4 pb-6 pt-8 sm:px-8 lg:px-12 lg:pt-12 2xl:px-16">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9c431d]">Explore. Compare. Book with confidence.</p>
        <h1 className="mt-2 font-serif text-[42px] font-semibold leading-[0.95] tracking-[-0.045em] text-ink sm:text-[58px]">Browse by Style<span className="text-magenta">.</span></h1>
        <p className="mt-2 text-lg text-ink/80">Find your next look.</p>
        <div className="mt-5"><StyleCatalog items={items} /></div>
        <div className="mt-4 flex items-center gap-3 rounded-[12px] bg-blush/50 px-4 py-3 text-[11px]">
          <Compass size={17} className="shrink-0 text-magenta" />
          <span>{items.length ? "Choose a style to explore salons that currently offer it." : "Styles will appear here as salons publish their services."}</span>
        </div>
      </div>
    </section>
    <PublicFooter />
    <CustomerBottomNav active="search" />
  </main>;
}
