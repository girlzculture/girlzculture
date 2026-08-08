import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import ProductCheckoutClient from "@/components/commerce/ProductCheckoutClient";
import {
  CustomerBottomNav,
  PublicFooter,
  PublicHeader,
} from "@/components/site/PublicChrome";
import { supabase } from "@/lib/supabase";

type Row = Record<string, unknown>;

export default async function ProductCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data: salon } = await supabase
    .from("salons")
    .select("id,slug,name,status,is_discoverable")
    .eq("slug", slug)
    .eq("status", "Active")
    .eq("is_discoverable", true)
    .maybeSingle<Row>();
  if (!salon) notFound();
  const { data: products } = await supabase
    .from("salon_products")
    .select(
      "id,name,price,sale_price,photo_url,images,pickup_enabled,shipping_enabled,shipping_price,max_quantity_per_order,track_inventory,inventory_quantity",
    )
    .eq("salon_id", salon.id)
    .eq("is_visible", true)
    .eq("product_status", "Active")
    .is("archived_at", null)
    .order("created_at")
    .limit(200);

  return (
    <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />
      <div className="mx-auto w-full max-w-[1450px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href={`/salon/${slug}#products`}
              className="inline-flex items-center gap-2 text-xs font-bold text-plum hover:text-magenta"
            >
              <ArrowLeft size={15} />
              Back to {String(salon.name)}
            </Link>
            <h1 className="mt-4 font-serif text-4xl font-semibold text-plum sm:text-5xl">
              Review Your Order
            </h1>
            <p className="mt-2 text-sm text-ink/60">
              Product inventory and appointment availability are held only
              during secure checkout.
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs font-bold text-amber">
            <ShieldCheck size={18} />
            Secure · Verified Salon · Test Mode
          </p>
        </div>
        <Suspense
          fallback={
            <div className="rounded-2xl bg-white/80 p-8 text-sm text-ink/55">
              Loading your cart…
            </div>
          }
        >
          <ProductCheckoutClient
            salon={{
              id: String(salon.id),
              slug: String(salon.slug),
              name: String(salon.name),
            }}
            products={(products || []) as never}
          />
        </Suspense>
      </div>
      <PublicFooter reserveMobileNavigation />
      <CustomerBottomNav active="home" />
    </main>
  );
}
