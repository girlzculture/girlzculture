import { notFound } from "next/navigation";
import BusinessPhoto from "@/components/business/BusinessPhoto";
import BusinessSignupMedia from "@/components/business/BusinessSignupMedia";
import { DEFAULT_BUSINESS_SIGNUP_CONTENT } from "@/lib/businessSignupContent";
import "@/app/business/business-onboarding.css";

export default async function BusinessMediaAcceptancePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  const scenario = (await searchParams).scenario;
  if (scenario === "image-failure" || scenario === "gif") {
    return <main>
      <h1>Business media acceptance</h1>
      <section aria-label={scenario === "gif" ? "Animated image lifecycle fixture" : "Image fallback fixture"} style={{ position: "relative", height: 260 }}>
        <BusinessSignupMedia media={{
          ...DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.media,
          type: scenario === "gif" ? "gif" : "image",
          src: scenario === "gif" ? "/images/business/acceptance-motion.gif" : "/images/business/acceptance-missing-hero.avif",
          alt: "Configured hero image fixture",
        }} />
      </section>
    </main>;
  }
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
    <section aria-label="Background video lifecycle fixture" style={{ position: "relative", height: 260 }}>
      <BusinessSignupMedia video={{
        src: "/videos/business/business-signup-hero.mp4",
        poster: { src: "/images/business/hair-service.avif", alt: "" },
      }} />
    </section>
  </main>;
}
