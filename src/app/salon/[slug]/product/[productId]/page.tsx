import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Package, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SafeImage from "@/components/site/SafeImage";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";

type Salon = { id: string; name?: string | null; slug?: string | null; address_city?: string | null; address_state?: string | null };
type Product = { id: string; name?: string | null; description?: string | null; price?: number | null; photo_url?: string | null; in_person_only?: boolean | null };

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string; productId: string }> }) {
  const { slug, productId } = await params;
  const { data: salon } = await supabase.from("salons").select("id,name,slug,address_city,address_state").eq("slug", slug).maybeSingle<Salon>();
  if (!salon) notFound();
  const { data: product } = await supabase.from("salon_products").select("*").eq("id", productId).eq("salon_id", salon.id).eq("is_visible", true).maybeSingle<Product>();
  if (!product) notFound();
  const location = [salon.address_city, salon.address_state].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />
      <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-10 lg:py-12">
        <Link href={`/salon/${slug}#products`} className="inline-flex items-center gap-2 text-[12px] font-semibold text-plum hover:text-magenta"><ArrowLeft size={16} />Back to Our Products</Link>
        <section className="mt-5 grid overflow-hidden rounded-[20px] border border-plum/10 bg-white/80 shadow-[0_18px_50px_rgba(26,18,32,0.07)] lg:grid-cols-2">
          <div className="relative min-h-[360px] bg-blush/45 sm:min-h-[560px]">{product.photo_url ? <SafeImage src={product.photo_url} fallbackSrc={product.photo_url} alt={product.name || "Salon product"} priority className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 grid place-items-center text-plum/30"><Package size={104} strokeWidth={1.1} aria-hidden="true" /></span>}</div>
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-magenta">Our Products</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-plum sm:text-5xl">{product.name || "Salon product"}</h1>
            <p className="mt-4 text-2xl font-bold text-ink">${Number(product.price || 0).toFixed(2)}</p>
            {product.description ? <p className="mt-6 text-[14px] leading-7 text-ink/70">{product.description}</p> : null}
            <div className="mt-7 rounded-[13px] border border-amber/30 bg-[#fff7e9] p-4"><p className="flex items-start gap-3 text-[12px] font-semibold text-ink"><Store size={19} className="shrink-0 text-amber" />Available for in-person purchase at {salon.name || "the salon"}. There is no online checkout.</p>{location ? <p className="ml-8 mt-1 text-[11px] text-ink/55">{location}</p> : null}</div>
            <Link href={`/salon/${slug}/book`} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-magenta px-7 text-[13px] font-bold text-white shadow-[0_10px_28px_rgba(214,24,107,0.2)] hover:bg-[#bb145d]"><CalendarDays size={17} />Book an Appointment</Link>
          </div>
        </section>
      </div>
      <PublicFooter />
      <CustomerBottomNav active="home" />
    </main>
  );
}
