import { notFound } from "next/navigation";
import BusinessPhoto from "@/components/business/BusinessPhoto";
import BusinessSignupMedia from "@/components/business/BusinessSignupMedia";
import "@/app/business/business-onboarding.css";

export default function BusinessMediaAcceptancePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  return <main>
    <h1>Business media acceptance</h1>
    <section aria-label="Configurable service image" style={{ width: 240 }}>
      <BusinessPhoto photo={{
        src: "/images/business/nails-service.avif",
        alt: "Manicure service image fixture",
        objectFit: "contain",
        objectPosition: "25% 75%",
        aspectRatio: "3 / 2",
      }} />
    </section>
    <section aria-label="Background video lifecycle fixture">
      <BusinessSignupMedia video={{
        src: "/videos/business/business-signup-hero.mp4",
        poster: { src: "/images/business/hair-service.avif", alt: "" },
      }} />
    </section>
  </main>;
}
