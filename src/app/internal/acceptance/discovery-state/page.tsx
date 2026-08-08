import { notFound } from "next/navigation";
import SalonDiscovery from "@/components/public/SalonDiscovery";
import type { PublicSalonResult } from "@/lib/discoveryServer";

const salons: PublicSalonResult[] = Array.from({ length: 20 }, (_, index) => ({
  id: `acceptance-discovery-${index}`,
  name: `Acceptance Salon ${index + 1}`,
  slug: `acceptance-salon-${index + 1}`,
  address_city: "New York",
  address_state: "NY",
  borough: "Harlem",
  cover_photo_url: null,
  verification_status: "Verified",
  rating_overall: 4.8,
  review_count: 25 + index,
  latitude: 40.8116 + index * 0.0001,
  longitude: -73.9465,
  starting_price: 100 + index,
  services: [{ id: `acceptance-style-${index}`, name: "Knotless Braids" }],
  distance_miles: 0.2 + index * 0.1,
  total_count: 20,
}));

export default function DiscoveryStateAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return (
    <main className="min-h-screen bg-cream p-4 text-ink">
      <SalonDiscovery
        initialSalons={salons}
        initialTotal={20}
        initialQuery="salons near me"
        initialLocation="Harlem, NY"
        initialOrigin={{ lat: 40.8116, lng: -73.9465 }}
      />
    </main>
  );
}
