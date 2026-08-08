import { notFound } from "next/navigation";
import GoogleSalonMap from "@/components/search/GoogleSalonMap";

export default function MapProviderAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();

  return (
    <main data-google-maps-provider-surface className="mx-auto max-w-4xl p-4">
      <h1 className="font-serif text-2xl text-plum">Google Maps provider acceptance</h1>
      <GoogleSalonMap
        selectedSalonId="acceptance-braid-lounge"
        salons={[
          {
            id: "acceptance-braid-lounge",
            name: "The Braid Lounge",
            slug: "the-braid-lounge",
            latitude: 40.7185,
            longitude: -73.9582,
            rating_overall: 4.9,
            review_count: 982,
            starting_price: 150,
            distance_miles: 1.46,
          },
          {
            id: "acceptance-crowned-collective",
            name: "Crowned Collective",
            slug: "crowned-collective",
            latitude: 40.6895,
            longitude: -73.9442,
            rating_overall: 4.8,
            review_count: 762,
            starting_price: 120,
            distance_miles: 3.2,
          },
        ]}
      />
    </main>
  );
}
