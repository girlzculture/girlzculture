import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Box, Package, Store, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SafeImage from "@/components/site/SafeImage";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { bestPromotionForContext, promotionLabel, type SalonPromotion } from "@/lib/salonPromotions";
import ProductPurchaseActions from "@/components/commerce/ProductPurchaseActions";

type Salon = { id: string; name?: string | null; slug?: string | null; address_city?: string | null; address_state?: string | null };
type Product = {
  id: string;
  name?: string | null;
  description?: string | null;
  price?: number | null;
  sale_price?: number | null;
  photo_url?: string | null;
  images?: string[] | null;
  inventory_quantity?: number | null;
  track_inventory?: boolean | null;
  max_quantity_per_order?: number | null;
  pickup_enabled?: boolean | null;
  pickup_prep_minutes?: number | null;
  shipping_enabled?: boolean | null;
  shipping_price?: number | null;
  product_status?: string | null;
};

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ slug: string; productId: string }>; searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const { slug, productId } = await params;
  const query = await searchParams;
  const { data: salon } = await supabase.from("salons").select("id,name,slug,address_city,address_state").eq("slug", slug).maybeSingle<Salon>();
  if (!salon) notFound();
  const { data: product } = await supabase.from("salon_products").select("*").eq("id", productId).eq("salon_id", salon.id).eq("is_visible", true).eq("product_status", "Active").maybeSingle<Product>();
  if (!product) notFound();
  let promotionQuery = supabase.from("salon_promotions").select("id,salon_id,title,description,public_headline,promotion_type,discount_value,discount_label,status,target_scope,target_ids,restrictions,starts_at,ends_at,is_active,archived_at").eq("salon_id",salon.id).eq("status","Active").eq("is_active",true).is("archived_at",null);
  const requestedPromotion = typeof query.promotion === "string" ? query.promotion : "";
  if (requestedPromotion) promotionQuery = promotionQuery.eq("id",requestedPromotion);
  const { data: promotionRows } = await promotionQuery;
  const catalogPrice = Number(product.sale_price ?? product.price ?? 0);
  const offer = bestPromotionForContext((promotionRows || []) as SalonPromotion[], { salonId: salon.id, productId: product.id, basePrice: catalogPrice, selectedAddons: [], subtotal: catalogPrice });
  const location = [salon.address_city, salon.address_state].filter(Boolean).join(", ");
  const image = product.photo_url || product.images?.[0] || null;

  return (
    <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />
      <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-10 lg:py-12">
        <Link href={`/salon/${slug}#products`} className="inline-flex items-center gap-2 text-[12px] font-semibold text-plum hover:text-magenta"><ArrowLeft size={16} />Back to Our Products</Link>
        <section className="mt-5 grid overflow-hidden rounded-[20px] border border-plum/10 bg-white/80 shadow-[0_18px_50px_rgba(26,18,32,0.07)] lg:grid-cols-2">
          <div className="relative aspect-square bg-blush/45">{image ? <SafeImage src={image} fallbackSrc={image} alt={product.name || "Salon product"} priority className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center text-plum/30"><Package size={104} strokeWidth={1.1} aria-hidden="true" /></span>}</div>
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-magenta">Our Products</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-plum sm:text-5xl">{product.name || "Salon product"}</h1>
            {offer ? <div className="mt-4"><span className="inline-flex rounded-full bg-amber/20 px-3 py-1 text-[10px] font-bold text-[#805000]">{promotionLabel(offer.promotion)}</span><p className="mt-2 text-sm text-ink/45 line-through">${catalogPrice.toFixed(2)}</p><p className="text-2xl font-bold text-magenta">${offer.price.total.toFixed(2)}</p><p className="mt-2 text-[11px] text-plum">{offer.promotion.public_headline || offer.promotion.title}</p></div> : product.sale_price !== null && product.sale_price !== undefined ? <div className="mt-4 flex items-end gap-3"><p className="text-sm text-ink/45 line-through">${Number(product.price || 0).toFixed(2)}</p><p className="text-2xl font-bold text-magenta">${catalogPrice.toFixed(2)}</p></div> : <p className="mt-4 text-2xl font-bold text-ink">${catalogPrice.toFixed(2)}</p>}
            {product.description ? <p className="mt-6 text-[14px] leading-7 text-ink/70">{product.description}</p> : null}
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {product.pickup_enabled ? <div className="rounded-[13px] border border-amber/30 bg-[#fff7e9] p-4"><p className="flex items-start gap-3 text-[12px] font-semibold text-ink"><Store size={19} className="shrink-0 text-amber" />Pickup from {salon.name || "the salon"}</p><p className="ml-8 mt-1 text-[11px] text-ink/55">{Number(product.pickup_prep_minutes || 0) > 0 ? `Usually ready in about ${Number(product.pickup_prep_minutes)} minutes` : "Pickup timing is confirmed by the salon"}{location ? ` · ${location}` : ""}</p></div> : null}
              {product.shipping_enabled ? <div className="rounded-[13px] border border-plum/15 bg-blush/30 p-4"><p className="flex items-start gap-3 text-[12px] font-semibold text-ink"><Truck size={19} className="shrink-0 text-magenta" />US shipping available</p><p className="ml-8 mt-1 text-[11px] text-ink/55">{Number(product.shipping_price || 0) > 0 ? `$${Number(product.shipping_price).toFixed(2)} shipping` : "Free shipping"}</p></div> : null}
            </div>
            <ProductPurchaseActions
              salonId={salon.id}
              salonSlug={String(salon.slug || slug)}
              salonName={String(salon.name || "Salon")}
              productId={product.id}
              productName={String(product.name || "Salon product")}
              imageUrl={image}
              unitPrice={catalogPrice}
              promotionId={offer?.promotion.id || null}
              promotionLabel={
                offer ? promotionLabel(offer.promotion) : null
              }
              estimatedUnitPrice={offer?.price.total ?? null}
              maxQuantity={Number(product.max_quantity_per_order || 10)}
              availableQuantity={product.track_inventory ? Number(product.inventory_quantity || 0) : null}
              pickupEnabled={product.pickup_enabled === true}
              shippingEnabled={product.shipping_enabled === true}
            />
            <Link href={`/salon/${slug}/book?with_products=1`} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-plum/15 px-7 text-[12px] font-bold text-plum hover:border-magenta hover:text-magenta"><Box size={16} />Add an appointment to this order</Link>
          </div>
        </section>
      </div>
      <PublicFooter />
      <CustomerBottomNav active="home" />
    </main>
  );
}
