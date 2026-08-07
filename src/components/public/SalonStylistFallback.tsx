import Link from "next/link";
import SafeImage from "@/components/site/SafeImage";

type Fallback = {
  mode?: string;
  image_url?: string | null;
  product_id?: string | null;
  promotion_id?: string | null;
};
type Product = {
  id?: string;
  name?: string | null;
  description?: string | null;
  photo_url?: string | null;
};
type Promotion = {
  id?: string | null;
  title?: string | null;
  description?: string | null;
  public_headline?: string | null;
};

function ProductCard({ product, salonSlug }: { product: Product; salonSlug: string }) {
  return (
    <Link
      href={`/salon/${salonSlug}/product/${product.id}`}
      className="block overflow-hidden rounded-[14px] border border-plum/10 bg-white"
    >
      <div className="grid grid-cols-[104px_1fr] gap-3 p-3 sm:grid-cols-[140px_1fr]">
        {product.photo_url ? (
          <SafeImage
            src={product.photo_url}
            fallbackSrc={product.photo_url}
            alt={product.name || "Salon product"}
            className="h-28 w-full rounded-[10px] object-cover sm:h-32"
          />
        ) : (
          <span className="grid h-28 place-items-center rounded-[10px] bg-blush px-3 text-center text-xs font-bold text-plum sm:h-32">
            Product photo coming soon
          </span>
        )}
        <div className="min-w-0 py-1">
          <p className="text-xs font-bold uppercase tracking-wide text-magenta">
            Featured salon product
          </p>
          <h3 className="mt-1 font-serif text-lg font-semibold text-plum sm:text-xl">
            {product.name}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-ink/65">
            {product.description || "View product details, pickup, and shipping options."}
          </p>
          <span className="mt-3 inline-flex min-h-9 items-center rounded-[8px] bg-magenta px-3 text-sm font-bold text-white">
            View product
          </span>
        </div>
      </div>
    </Link>
  );
}

function PromotionCard({ promotion, salonSlug }: { promotion: Promotion; salonSlug: string }) {
  return (
    <div className="rounded-[14px] border border-magenta/20 bg-blush/25 p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-magenta">
        Current salon offer
      </p>
      <h3 className="mt-2 font-serif text-xl font-semibold text-plum">
        {promotion.public_headline || promotion.title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-ink/70">
        {promotion.description || "Review this salon’s services to see where the offer applies."}
      </p>
      <Link
        href={`/salon/${salonSlug}#services`}
        className="mt-3 inline-flex min-h-10 items-center rounded-[8px] bg-magenta px-4 text-sm font-bold text-white"
      >
        View eligible services
      </Link>
    </div>
  );
}

export default function SalonStylistFallback({
  fallback,
  products,
  promotions,
  salonSlug,
}: {
  fallback: Fallback;
  products: Product[];
  promotions: Promotion[];
  salonSlug: string;
}) {
  if (fallback.mode === "image" && fallback.image_url) {
    return (
      <div className="overflow-hidden rounded-[14px] border border-plum/10 bg-white">
        <SafeImage
          src={fallback.image_url}
          fallbackSrc={fallback.image_url}
          alt="Salon highlight"
          className="h-52 w-full object-cover sm:h-64"
        />
        <div className="p-4">
          <p className="text-sm font-bold text-plum">Salon team highlight</p>
          <p className="mt-1 text-sm text-ink/65">
            Individual stylist profiles are being prepared. Services and booking remain available.
          </p>
          <Link
            href={`/salon/${salonSlug}#services`}
            className="mt-3 inline-flex min-h-10 items-center rounded-[8px] bg-magenta px-4 text-sm font-bold text-white"
          >
            View services and prices
          </Link>
        </div>
      </div>
    );
  }

  if (fallback.mode === "product") {
    const product = products.find((entry) => entry.id === fallback.product_id);
    if (product?.id) return <ProductCard product={product} salonSlug={salonSlug} />;
  }

  if (fallback.mode === "promotion") {
    const promotion = promotions.find(
      (entry) => entry.id === fallback.promotion_id,
    );
    if (promotion?.id)
      return <PromotionCard promotion={promotion} salonSlug={salonSlug} />;
  }

  const firstPromotion = promotions.find((entry) => entry.id);
  if (firstPromotion)
    return <PromotionCard promotion={firstPromotion} salonSlug={salonSlug} />;
  const firstProduct = products.find((entry) => entry.id);
  if (firstProduct)
    return <ProductCard product={firstProduct} salonSlug={salonSlug} />;

  return (
    <div className="rounded-[14px] border border-plum/15 bg-blush/25 p-4 sm:p-5">
      <h3 className="font-serif text-xl font-semibold text-plum">
        Stylist profiles are being prepared
      </h3>
      <p className="mt-2 text-sm leading-6 text-ink/70">
        You can still compare this salon’s published services, prices, duration, availability, and booking details. The salon will assign an available professional where applicable.
      </p>
      <Link
        href={`/salon/${salonSlug}#services`}
        className="mt-3 inline-flex min-h-10 items-center rounded-[8px] bg-magenta px-4 text-sm font-bold text-white"
      >
        View services and prices
      </Link>
    </div>
  );
}
