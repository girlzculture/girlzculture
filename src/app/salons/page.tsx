import SalonDiscovery, { DiscoverySalon } from "@/components/public/SalonDiscovery";
import { CustomerBottomNav, PublicHeader, TrustStrip } from "@/components/site/PublicChrome";
import { supabase } from "@/lib/supabase";

const fallbackImages = ["/images/salon-warm.jpg", "/images/salon-blush.jpg", "/images/salon-dark.jpg", "/images/salon-modern.jpg"];

export default async function SalonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const [{ data: salons }, { data: styles }] = await Promise.all([
    supabase.from("salons").select("*"),
    supabase.from("styles").select("salon_id,name,price_display_min"),
  ]);
  const mapped: DiscoverySalon[] = (salons || []).map((salon, index) => {
    const salonStyles = (styles || []).filter((item) => item.salon_id === salon.id);
    const prices = salonStyles.map((item) => Number(item.price_display_min)).filter((value) => value > 0);
    const tier = salon.subscription_tier || "Basic";
    return { id: salon.id, name: salon.name || "Salon", slug: salon.slug || salon.id, neighborhood: salon.neighborhood || "Location not provided", city: salon.address_city || "", rating: Number(salon.rating_overall || 0), reviewCount: Number(salon.review_count || 0), image: salon.cover_photo_url || fallbackImages[index % fallbackImages.length], startingPrice: prices.length ? Math.min(...prices) : null, tier, verified: String(salon.verification_status || "").toLowerCase().startsWith("verified"), styles: salonStyles.map((item) => item.name).filter(Boolean), nextAvailability: null, latitude: salon.latitude, longitude: salon.longitude };
  });
  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0"><PublicHeader active="salons" /><section className="mx-auto w-full max-w-[1760px] px-4 pb-5 pt-6 sm:px-8 lg:px-12 2xl:px-16"><h1 className="font-serif text-[42px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[56px]">Find salons that fit your style<span className="text-magenta">.</span></h1><p className="mt-2 text-sm sm:text-base">Search by vibe, braid style, price, and availability.</p><div className="mt-4"><SalonDiscovery initialSalons={mapped} initialStyle={typeof query.style === "string" ? query.style : ""} initialLocation={typeof query.location === "string" ? query.location : ""} /></div></section><TrustStrip /><CustomerBottomNav active="search" /></main>;
}
