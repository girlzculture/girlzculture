import { notFound } from "next/navigation";
import ExpandableSalonDescription from "@/components/public/ExpandableSalonDescription";
import SalonRatingSummary from "@/components/public/SalonRatingSummary";
import SalonReviews from "@/components/SalonReviews";
import SalonStyles from "@/components/SalonStyles";
import SalonTrustLabels, {
  SalonVerificationBadge,
} from "@/components/public/SalonTrustLabels";

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

      <section aria-label="Unverified salon trust" className="mt-6 rounded-xl bg-white p-5">
        <h2 className="font-serif text-2xl">Unverified Salon</h2>
        <SalonTrustLabels
          verified={false}
          labels={[
            "Verified",
            "Identity checked",
            "License confirmed",
            "Girlz Culture Approved",
            "Vetted Professional",
            "Certified Salon",
            "Background Checked",
            "Trusted Professional",
            "Transparent Pricing · Verified",
            "Transparent Pricing",
            "Time Respected",
            "Real Availability",
          ]}
        />
      </section>

      <section aria-label="Unverified public salon header" className="mt-6 rounded-xl bg-white p-5">
        <h2 className="font-serif text-2xl">Unverified public header</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <SalonVerificationBadge verified={false} label="Salon Profile" />
          <span className="rounded-full bg-blush/55 px-3 py-1.5 text-[9px] font-bold text-plum">
            Open today
          </span>
        </div>
      </section>

      <section aria-label="Verified salon trust" className="mt-6 rounded-xl bg-white p-5">
        <h2 className="font-serif text-2xl">Verified Salon</h2>
        <SalonTrustLabels
          verified
          labels={[
            "Verified",
            "Transparent Pricing",
            "Time Respected",
            "Real Availability",
          ]}
        />
      </section>

      <section aria-label="Verified public salon header" className="mt-6 rounded-xl bg-white p-5">
        <h2 className="font-serif text-2xl">Verified public header</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <SalonVerificationBadge verified label="Verified Salon" />
          <span className="rounded-full bg-blush/55 px-3 py-1.5 text-[9px] font-bold text-plum">
            Open today
          </span>
        </div>
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

      <section aria-label="Empty salon reviews" className="mt-12">
        <SalonReviews
          reviews={[]}
          salonRating={0}
          salonReviewCount={0}
          sectionId="reviews"
        />
      </section>

      <section aria-label="Published salon review and reply" className="mt-12">
        <SalonReviews
          reviews={[{
            id: "published-review",
            display_name: "Keisha R.",
            review_title: "Beautiful, on-time result",
            rating_overall: 5,
            rating_price_accuracy: 5,
            rating_punctuality: 5,
            rating_quality: 5,
            rating_cleanliness: 5,
            written_review: "The finished style matched the service I booked and the appointment started on time.",
            salon_reply: "Thank you, Keisha. We appreciate your visit and look forward to seeing you again.",
            created_at: "2026-08-15T12:00:00.000Z",
          }]}
          salonRating={5}
          salonReviewCount={1}
          sectionId="published-reviews"
        />
      </section>
    </main>
  );
}
