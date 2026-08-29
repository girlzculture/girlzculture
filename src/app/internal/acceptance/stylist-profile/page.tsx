import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefcaseBusiness, CalendarDays, Scissors, Star } from "lucide-react";
import {
  CustomerBottomNav,
  PublicFooter,
  PublicHeader,
} from "@/components/site/PublicChrome";

export default function StylistProfileAccessibilityAcceptancePage() {
  const enabled =
    process.env.GIRLZ_CULTURE_ACCEPTANCE_MODE === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS === "true";
  if (!enabled) notFound();

  return (
    <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0">
      <PublicHeader />
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <p
          role="status"
          className="rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-sm font-semibold text-ink"
        >
          Internal deterministic accessibility fixture · no provider or production data is used.
        </p>
        <Link
          href="/salon/acceptance-salon"
          className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-plum hover:text-magenta"
        >
          ← Back to Acceptance Salon
        </Link>

        <section
          aria-labelledby="stylist-acceptance-heading"
          className="mt-5 overflow-hidden rounded-[20px] border border-plum/10 bg-white shadow-[0_18px_50px_rgba(13,17,20,0.07)]"
        >
          <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
            <div className="grid min-h-[320px] place-items-center bg-blush/55 p-8 sm:min-h-[440px]">
              <div
                aria-label="Portrait placeholder for Aaliyah J."
                className="grid aspect-square w-full max-w-[300px] place-items-center rounded-full border-4 border-white bg-plum font-serif text-7xl font-semibold text-white shadow-xl"
              >
                AJ
              </div>
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-14">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-magenta">
                Girlz Culture Professional
              </p>
              <h1
                id="stylist-acceptance-heading"
                className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-plum sm:text-5xl"
              >
                Aaliyah J.
              </h1>
              <p className="mt-2 text-sm gc-text-secondary">
                Acceptance Salon · Brooklyn, New York
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-blush/45 px-4 py-2 text-sm font-semibold text-ink">
                  <BriefcaseBusiness aria-hidden="true" size={16} className="text-magenta" />
                  10 years experience
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-blush/45 px-4 py-2 text-sm font-semibold text-ink">
                  <Star aria-hidden="true" size={16} className="fill-amber text-amber" />
                  4.9 rating
                </span>
              </div>
              <p className="mt-6 max-w-2xl text-base leading-7 text-ink">
                Aaliyah specializes in protective styles with clear consultations,
                careful parting, and published service expectations.
              </p>
              <div className="mt-6">
                <h2 className="flex items-center gap-2 text-sm font-bold text-plum">
                  <Scissors aria-hidden="true" size={17} />
                  Specialties
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Stylist specialties">
                  {['Knotless braids', 'Box braids', 'Feed-in braids'].map((specialty) => (
                    <li
                      key={specialty}
                      className="rounded-full border border-plum/15 bg-white px-3 py-2 text-sm text-ink"
                    >
                      {specialty}
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href="#acceptance-booking"
                className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-magenta px-7 text-sm font-bold text-white hover:bg-primary-hover"
              >
                <CalendarDays aria-hidden="true" size={18} />
                Review booking fixture
              </a>
            </div>
          </div>
        </section>

        <section
          id="acceptance-booking"
          aria-labelledby="acceptance-booking-heading"
          className="mt-8 rounded-[16px] border border-plum/10 bg-white p-6"
        >
          <h2 id="acceptance-booking-heading" className="font-serif text-3xl text-plum">
            Booking handoff
          </h2>
          <p className="mt-2 max-w-3xl leading-7 text-ink">
            This fixture verifies the public stylist profile handoff without creating an
            appointment or contacting a payment provider.
          </p>
        </section>
      </div>
      <PublicFooter reserveMobileNavigation />
      <CustomerBottomNav active="home" />
    </main>
  );
}
