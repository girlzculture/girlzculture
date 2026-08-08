import { notFound } from "next/navigation";
import { SalonMapSelectionSummary } from "@/components/search/GoogleSalonMap";

export default function MapSummaryAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return (
    <main className="relative min-h-[360px] bg-blush p-4">
      <SalonMapSelectionSummary
        salon={{
          id: "acceptance-map-salon",
          name: "The Braid Lounge",
          slug: "the-braid-lounge",
          rating_overall: 4.9,
          review_count: 982,
          starting_price: 150,
          distance_miles: 1.46,
        }}
      />
    </main>
  );
}
