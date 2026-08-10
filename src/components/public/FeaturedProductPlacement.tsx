import Link from "next/link";
import { MapPin, PackageCheck, Tag } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import SalonDistance from "@/components/public/SalonDistance";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";
import {
  bestPromotionForContext,
  promotionLabel,
  type SalonPromotion,
} from "@/lib/salonPromotions";

type Row = Record<string, unknown>;
const PUBLIC_PRODUCT_READ_TIMEOUT_MS = 2_500;

function related(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) || null;
  return value && typeof value === "object" ? (value as Row) : null;
}

function images(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

async function loadFeaturedProducts(maxCards: number) {
  const now = new Date().toISOString();
  try {
    const admin = getSupabaseAdmin();
    const placements = await admin
      .from("homepage_product_placements")
      .select(
        "id,sort_order,product:salon_products(id,salon_id,name,description,price,sale_price,photo_url,images,inventory_quantity,track_inventory,pickup_enabled,product_status,is_visible,archived_at,salon:salons(id,name,slug,status,is_discoverable,subscription_status,address_city,address_state,latitude,longitude))",
      )
      .in("status", ["Active", "Scheduled"])
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("sort_order")
      .limit(Math.max(1, Math.min(24, Math.round(maxCards))))
      .abortSignal(AbortSignal.timeout(PUBLIC_PRODUCT_READ_TIMEOUT_MS));
    if (placements.error) throw placements.error;

    const eligible = ((placements.data || []) as Row[]).filter((placement) => {
      const product = related(placement.product);
      const salon = related(product?.salon);
      return (
        product &&
        salon &&
        product.pickup_enabled === true &&
        product.product_status === "Active" &&
        product.is_visible === true &&
        !product.archived_at &&
        salon.status === "Active" &&
        salon.is_discoverable === true &&
        ["active", "trialing"].includes(
          String(salon.subscription_status || "").toLowerCase(),
        ) &&
        (product.track_inventory !== true ||
          Number(product.inventory_quantity || 0) > 0)
      );
    });
    if (!eligible.length) return null;

    const salonIds = [
      ...new Set(
        eligible
          .map((placement) => related(placement.product))
          .map((product) => String(product?.salon_id || ""))
          .filter(Boolean),
      ),
    ];
    const promotions = await admin
      .from("salon_promotions")
      .select(
        "id,salon_id,title,description,public_headline,promotion_type,discount_value,discount_label,status,target_scope,target_ids,restrictions,starts_at,ends_at,is_active,archived_at",
      )
      .in("salon_id", salonIds)
      .eq("status", "Active")
      .eq("is_active", true)
      .is("archived_at", null)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .abortSignal(AbortSignal.timeout(PUBLIC_PRODUCT_READ_TIMEOUT_MS));
    if (promotions.error) throw promotions.error;

    return {
      eligible,
      promotions: (promotions.data || []) as SalonPromotion[],
    };
  } catch (error) {
    await capturePublicPageFailure(
      error,
      "featured-products",
      "load-homepage-products",
    );
    // Featured products are optional homepage inventory. A slow provider must
    // not prevent the main booking/discovery experience from rendering.
    return null;
  }
}

export default async function FeaturedProductPlacement({
  title = "Featured Products",
  description,
  maxCards = 12,
}: {
  title?: string;
  description?: string | null;
  maxCards?: number;
}) {
  const data = await loadFeaturedProducts(maxCards);
  if (!data) return null;
  const { eligible, promotions } = data;
  return (
      <section
        aria-labelledby="featured-products-heading"
        className="pb-5 pt-3 sm:pb-6"
      >
        <div className="mb-3">
          <div className="flex items-baseline gap-3">
            <h2
              id="featured-products-heading"
              className="font-serif text-[23px] font-semibold text-ink sm:text-[28px]"
            >
              {title}
            </h2>
            <span className="text-[10px] text-ink/50">Curated placements</span>
          </div>
          {description ? (
            <p className="mt-1 text-xs text-ink/60">{description}</p>
          ) : null}
        </div>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {eligible.map((placement) => {
            const product = related(placement.product)!;
            const salon = related(product.salon)!;
            const basePrice = Number(product.sale_price ?? product.price ?? 0);
            const offer = bestPromotionForContext(
              promotions,
              {
                salonId: String(product.salon_id),
                productId: String(product.id),
                basePrice,
                selectedAddons: [],
                subtotal: basePrice,
              },
            );
            const image =
              String(product.photo_url || "") ||
              images(product.images)[0] ||
              "/images/braids-knotless.jpg";
            const href = `/salon/${encodeURIComponent(String(salon.slug))}/product/${encodeURIComponent(String(product.id))}${offer?.promotion.id ? `?promotion=${encodeURIComponent(String(offer.promotion.id))}` : ""}`;
            const inventory = Number(product.inventory_quantity || 0);
            return (
              <article
                key={String(placement.id)}
                className="w-[245px] shrink-0 snap-start overflow-hidden rounded-[16px] border border-plum/10 bg-white shadow-[0_8px_24px_rgba(13,17,20,.07)] sm:w-[270px]"
              >
                <Link href={href} className="block">
                  <div className="relative aspect-[4/3] overflow-hidden bg-blush/30">
                    <SafeImage
                      src={image}
                      fallbackSrc="/images/braids-knotless.jpg"
                      alt={String(product.name)}
                      rendition="thumbnail"
                      className="h-full w-full object-cover transition duration-300 hover:scale-[1.025]"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-ink/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white">
                      Featured
                    </span>
                    {offer ? (
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-magenta px-2.5 py-1 text-[10px] font-bold text-white">
                        <Tag size={11} />
                        {promotionLabel(offer.promotion)}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-1 font-serif text-lg font-semibold text-plum">
                      {String(product.name)}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-ink">
                      {String(salon.name)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-ink/55">
                      <MapPin size={11} />
                      <span className="sm:hidden"><SalonDistance latitude={salon.latitude as number | null} longitude={salon.longitude as number | null}/></span>
                      <span className="hidden sm:inline">
                        {[salon.address_city, salon.address_state]
                          .filter(Boolean)
                          .join(", ") || "Local salon pickup"}
                      </span>
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <b className="text-base text-ink">
                          {money(offer?.price.total ?? basePrice)}
                        </b>
                        {offer ? (
                          <span className="ml-2 text-[10px] text-ink/45 line-through">
                            {money(basePrice)}
                          </span>
                        ) : null}
                      </div>
                      <span className="flex items-center gap-1 text-[9px] font-bold text-teal">
                        <PackageCheck size={13} />
                        {product.track_inventory === true
                          ? `${inventory} available`
                          : "In stock"}
                      </span>
                    </div>
                    <span className="mt-3 flex min-h-10 items-center justify-center rounded-lg bg-teal text-xs font-bold text-white">
                      Reserve for Pickup
                    </span>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    );
}
