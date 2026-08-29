import { notFound } from "next/navigation";
import ExpandableSalonDescription from "@/components/public/ExpandableSalonDescription";
import SalonRatingSummary from "@/components/public/SalonRatingSummary";
import SalonStyles from "@/components/SalonStyles";

const description = Array.from(
  { length: 110 },
  (_, index) => `description-word-${index + 1}`,
).join(" ");

export default function SalonProfileAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-cream p-6 text-ink">
      <h1 className="font-serif text-3xl">Salon profile acceptance</h1>

      <section aria-label="Salon identity fixture" className="mt-6 rounded-xl bg-white p-5">
        <h2 className="font-serif text-2xl">Acceptance Salon</h2>
        <SalonRatingSummary rating={4.5} reviewCount={12} />
        <ExpandableSalonDescription description={description} aiAssisted />
      </section>

      <section aria-label="Styles and pricing fixture" className="mt-6">
        <h2 className="mb-3 font-serif text-2xl">Styles &amp; Pricing</h2>
        <SalonStyles
          salonId="11111111-1111-4111-8111-111111111111"
          salonSlug="acceptance-salon"
          styles={[
            {
              id: "style-one",
              name: "Knotless Braids",
              price_display_min: 100,
              price_display_max: 140,
              duration_min_hours: 2,
              duration_max_hours: 3,
              addons: [{ label: "Waist length", price: 30 }],
            },
            {
              id: "style-two",
              name: "Silk Press",
              price_display_min: 85,
              price_display_max: 110,
              duration_min_hours: 1,
              duration_max_hours: 1.5,
              included_items: ["Shampoo", "Conditioning treatment"],
            },
          ]}
          styleMaterialsByStyleId={{}}
        />
      </section>

      <section id="reviews" tabIndex={-1} className="mt-12 rounded-xl bg-white p-5">
        <h2 className="font-serif text-2xl">Reviews</h2>
        <p>Verified customer reviews fixture.</p>
      </section>
    </main>
  );
}
