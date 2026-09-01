import { Compass } from "lucide-react";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import StyleCatalog, { StyleCatalogItem } from "@/components/public/StyleCatalog";
import { supabase } from "@/lib/supabase";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";
import FirstRelevantLocationRequest from "@/components/location/FirstRelevantLocationRequest";

type StyleRow = {
  master_style_id?: string | null;
  name?: string | null;
  category_id?: string | null;
  service_group_id?: string | null;
  service_category_name?: string | null;
  service_category_slug?: string | null;
  salon_count?: number | string | null;
  starting_price?: number | string | null;
  image?: string | null;
  lengths?: string[] | null;
  search_terms?: string[] | null;
};

export const dynamic = "force-dynamic";

export default async function StylesPage() {
  const pageSize = 500;
  const catalogRows: StyleRow[] = [];
  let catalogError: unknown = null;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.rpc("list_public_style_catalog", {
      p_limit: pageSize,
      p_offset: offset,
    });
    if (error) {
      catalogError = error;
      catalogRows.length = 0;
      break;
    }
    const page = (data || []) as StyleRow[];
    catalogRows.push(...page);
    if (page.length < pageSize) break;
  }

  if (catalogError)
    await capturePublicPageFailure(
      catalogError,
      "style-catalog-page",
      "load-published-styles",
    );

  const items = catalogRows
    .map((raw): StyleCatalogItem | null => {
      const name = raw.name?.trim();
      const styleId = raw.master_style_id?.trim();
      const count = Number(raw.salon_count || 0);
      const numericPrice = Number(raw.starting_price);
      if (!name || !styleId || !Number.isFinite(count) || count <= 0) return null;
      return {
        name,
        category: raw.service_category_name?.trim() || "Beauty Services",
        categorySlug: raw.service_category_slug?.trim() || "beauty-services",
        styleId,
        styleSlug: name
          .toLocaleLowerCase("en")
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        count,
        image: raw.image?.trim() || "",
        lengths: (raw.lengths || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
        searchTerms: (raw.search_terms || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
        price:
          Number.isFinite(numericPrice) && numericPrice > 0
            ? numericPrice
            : undefined,
      };
    })
    .filter((item): item is StyleCatalogItem => item !== null);

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
