import { Compass } from "lucide-react";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import StyleCatalog, { StyleCatalogItem } from "@/components/public/StyleCatalog";
import { supabase } from "@/lib/supabase";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";
import FirstRelevantLocationRequest from "@/components/location/FirstRelevantLocationRequest";

type StyleRow = {
  name?: string | null;
  category?: string | null;
  category_id?: string | null;
  master_style_id?: string | null;
  service_category_name?: string | null;
  service_category_slug?: string | null;
  salon_id?: string | null;
  price_display_min?: number | null;
  base_price?: number | null;
  photos?: string[] | null;
  length_options?: Array<{ label?: string }> | null;
};

export const dynamic = "force-dynamic";

export default async function StylesPage() {
  const { data, error } = await supabase.rpc("list_public_style_catalog", {
    p_limit: 1000,
  });

  if (error) await capturePublicPageFailure(error, "style-catalog-page", "load-published-styles");

  const grouped = new Map<string, StyleCatalogItem & { salons: Set<string> }>();
  for (const raw of (data || []) as StyleRow[]) {
    const name = raw.name?.trim();
    if (!name) continue;
    const category = raw.service_category_name || "Braiding";
    const categorySlug = raw.service_category_slug || "braiding";
    const key = `${categorySlug}:${name.toLocaleLowerCase()}`;
    const price = Number(raw.price_display_min || raw.base_price || 0);
    const existing = grouped.get(key) || {
      name,
      category,
      categorySlug,
      styleId: raw.master_style_id || undefined,
      styleSlug: name.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      count: 0,
      salons: new Set<string>(),
      image: raw.photos?.[0] || "",
      length: raw.length_options?.[0]?.label,
      price: price > 0 ? price : undefined,
    };
    if (raw.salon_id) existing.salons.add(raw.salon_id);
    if (!existing.styleId && raw.master_style_id) existing.styleId = raw.master_style_id;
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
    <FirstRelevantLocationRequest />
    <section className="relative overflow-hidden border-b border-plum/10">
      <div className="mx-auto w-full max-w-[1760px] px-4 pb-6 pt-3 sm:px-8 sm:pt-5 lg:px-12 2xl:px-16">
        <StyleCatalog items={items} />
        <div className="mt-4 flex items-center gap-3 rounded-[12px] bg-blush/50 px-4 py-3 text-[11px]">
          <Compass size={17} className="shrink-0 text-magenta" />
          <span>{items.length ? "Choose a style to explore salons that currently offer it." : "Styles will appear here as salons publish their services."}</span>
        </div>
      </div>
    </section>
    <PublicFooter reserveMobileNavigation />
    <CustomerBottomNav active="search" />
  </main>;
}
