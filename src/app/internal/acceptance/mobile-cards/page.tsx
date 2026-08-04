import { notFound } from "next/navigation";
import MarketplaceSalonCard from "@/components/public/MarketplaceSalonCard";
import type { PublicSalonResult } from "@/lib/discoveryServer";

const salons: PublicSalonResult[] = [
  {
    id: "acceptance-zuri",
    name: "Zuri Luxe Braid Studio With A Long Name",
    slug: "acceptance-zuri",
    address_city: "New York",
    address_state: "NY",
    borough: "Manhattan",
    cover_photo_url: null,
    verification_status: "Verified",
    rating_overall: 4.8,
    review_count: 126,
    latitude: 40.8116,
    longitude: -73.9465,
    starting_price: 20,
    services: [{ id: "acceptance-service", name: "Knotless Braids" }],
    distance_miles: 0.08,
    total_count: 2,
  },
  {
    id: "acceptance-titi",
    name: "Titi’s Beauty Bar",
    slug: "acceptance-titi",
    address_city: "New York",
    address_state: "NY",
    borough: "Manhattan",
    cover_photo_url: null,
    verification_status: "Verified",
    rating_overall: 0,
    review_count: 0,
    latitude: 40.817,
    longitude: -73.949,
    starting_price: 45,
    services: [{ id: "acceptance-service-2", name: "Silk Press" }],
    distance_miles: 0.6,
    total_count: 2,
  },
];

export default function MobileCardsAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return (
    <main className="min-h-screen bg-cream p-3 text-ink">
      <section aria-label="Compact salon card acceptance" className="flex gap-3 overflow-x-auto">
        {salons.map((salon) => (
          <MarketplaceSalonCard key={salon.id} salon={salon} variant="compact" />
        ))}
      </section>
    </main>
  );
}
