import Link from "next/link";
import { ImageIcon, Package, Tag } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";

type Fallback = { mode?: string; image_url?: string | null; product_id?: string | null; promotion_id?: string | null };
type Product = { id?: string; name?: string | null; description?: string | null; photo_url?: string | null };
type Promotion = { id?: string | null; title?: string | null; description?: string | null; public_headline?: string | null };

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
  if (fallback.mode === "image" && fallback.image_url) return <div className="overflow-hidden rounded-[14px] border border-plum/10 bg-white"><SafeImage src={fallback.image_url} fallbackSrc={fallback.image_url} alt="Salon highlight" className="h-56 w-full object-cover" /><p className="flex items-center gap-2 p-3 text-[10px] font-semibold text-plum"><ImageIcon size={14} />Salon highlight</p></div>;
  if (fallback.mode === "product") {
    const product = products.find((entry) => entry.id === fallback.product_id);
    if (product?.id) return <Link href={`/salon/${salonSlug}/product/${product.id}`} className="block overflow-hidden rounded-[14px] border border-plum/10 bg-white"><div className="grid grid-cols-[112px_1fr] gap-3 p-3">{product.photo_url ? <SafeImage src={product.photo_url} fallbackSrc={product.photo_url} alt={product.name || "Product"} className="h-28 w-28 rounded-[10px] object-cover" /> : <span className="grid h-28 w-28 place-items-center rounded-[10px] bg-blush text-plum/40"><Package /></span>}<div className="min-w-0 py-2"><p className="text-[9px] font-bold uppercase tracking-wide text-magenta">Salon product</p><h3 className="mt-1 font-serif text-lg font-semibold text-plum">{product.name}</h3><p className="mt-1 line-clamp-2 text-[10px] leading-5 text-ink/60">{product.description || "View product details."}</p></div></div></Link>;
  }
  if (fallback.mode === "promotion") {
    const promotion = promotions.find((entry) => entry.id === fallback.promotion_id);
    if (promotion?.id) return <div className="rounded-[14px] border border-magenta/20 bg-blush/25 p-5"><p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wide text-magenta"><Tag size={14} />Salon offer</p><h3 className="mt-2 font-serif text-xl font-semibold text-plum">{promotion.public_headline || promotion.title}</h3><p className="mt-2 text-[10px] leading-5 text-ink/65">{promotion.description || "Ask the salon about this offer."}</p></div>;
  }
  return <div className="rounded-[14px] border border-dashed border-plum/20 bg-blush/25 p-6 text-sm text-ink/65">This salon has not published stylist profiles yet.</div>;
}
