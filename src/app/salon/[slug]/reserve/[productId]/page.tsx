import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  CustomerBottomNav,
  PublicFooter,
  PublicHeader,
} from "@/components/site/PublicChrome";
import PickupReservationForm from "@/components/commerce/PickupReservationForm";
import {
  bestPromotionForContext,
  promotionLabel,
  type SalonPromotion,
} from "@/lib/salonPromotions";
import { getEngineNumber } from "@/lib/engineConfigServer";

type Salon = {
  id: string;
  name: string;
  slug: string;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
};
type Product = {
  id: string;
  name: string;
  price: number;
  sale_price?: number | null;
  photo_url?: string | null;
  images?: string[] | null;
  inventory_quantity?: number | null;
  track_inventory?: boolean | null;
  max_quantity_per_order?: number | null;
  pickup_enabled?: boolean | null;
};

export default async function PickupReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, productId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const { data: salon } = await supabase
    .from("salons")
    .select(
      "id,name,slug,address_street,address_city,address_state,address_zip",
    )
    .eq("slug", slug)
    .eq("status", "Active")
    .eq("is_discoverable", true)
    .maybeSingle<Salon>();
  if (!salon) notFound();
  const { data: product } = await supabase
    .from("salon_products")
    .select(
      "id,name,price,sale_price,photo_url,images,inventory_quantity,track_inventory,max_quantity_per_order,pickup_enabled",
    )
    .eq("id", productId)
    .eq("salon_id", salon.id)
    .eq("product_status", "Active")
    .eq("is_visible", true)
    .is("archived_at", null)
    .maybeSingle<Product>();
  if (!product || product.pickup_enabled !== true) notFound();
  const requestedQuantity = Number(
    typeof query.quantity === "string" ? query.quantity : 1,
  );
  const maximum = Math.max(
    1,
    Math.min(
      Number(product.max_quantity_per_order || 10),
      product.track_inventory
        ? Number(product.inventory_quantity || 0)
        : Number(product.max_quantity_per_order || 10),
    ),
  );
  const quantity =
    Number.isInteger(requestedQuantity) &&
    requestedQuantity >= 1 &&
    requestedQuantity <= maximum
      ? requestedQuantity
      : 1;
  if (product.track_inventory && maximum < 1) notFound();

  const requestedPromotion =
    typeof query.promotion === "string" ? query.promotion : "";
  const { data: promotionRows } = requestedPromotion
    ? await supabase
        .from("salon_promotions")
        .select(
          "id,salon_id,title,description,public_headline,promotion_type,discount_value,discount_label,status,target_scope,target_ids,restrictions,starts_at,ends_at,is_active,archived_at",
        )
        .eq("id", requestedPromotion)
        .eq("salon_id", salon.id)
        .eq("status", "Active")
        .eq("is_active", true)
        .is("archived_at", null)
    : { data: [] };
  const unitPrice = Number(product.sale_price ?? product.price ?? 0);
  const originalTotal = Number((unitPrice * quantity).toFixed(2));
  const offer = bestPromotionForContext(
    (promotionRows || []) as SalonPromotion[],
    {
      salonId: salon.id,
      productId: product.id,
      basePrice: originalTotal,
      selectedAddons: [],
      subtotal: originalTotal,
    },
  );
  const discountedTotal = Number(
    (offer?.price.total ?? originalTotal).toFixed(2),
  );
  const [depositPercent, depositMinimum, deadlineHours] = await Promise.all([
    getEngineNumber("commerce.pickup_deposit_percent", 10, 0, 100),
    getEngineNumber("commerce.pickup_deposit_minimum", 5, 0, 1000),
    getEngineNumber("commerce.pickup_deadline_hours", 72, 1, 720),
  ]);
  const depositAmount = Math.min(
    discountedTotal,
    Math.max(
      Number(((discountedTotal * depositPercent) / 100).toFixed(2)),
      depositMinimum,
    ),
  );
  const address = [
    salon.address_street,
    [salon.address_city, salon.address_state, salon.address_zip]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="min-h-screen bg-light-gray pb-20 text-charcoal md:pb-0">
      <PublicHeader />
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <PickupReservationForm
          salonId={salon.id}
          salonName={salon.name}
          salonAddress={address}
          productId={product.id}
          productName={product.name}
          productImage={product.photo_url || product.images?.[0] || null}
          quantity={quantity}
          originalTotal={originalTotal}
          discountedTotal={discountedTotal}
          promotionId={offer?.promotion.id || null}
          promotionLabel={
            offer ? promotionLabel(offer.promotion) : null
          }
          depositAmount={depositAmount}
          remainingBalance={Math.max(
            0,
            Number((discountedTotal - depositAmount).toFixed(2)),
          )}
          deadlineHours={Math.round(deadlineHours)}
        />
      </div>
      <PublicFooter />
      <CustomerBottomNav active="home" />
    </main>
  );
}
