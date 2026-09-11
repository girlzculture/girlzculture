import { notFound } from "next/navigation";
import BusinessPhoto from "@/components/business/BusinessPhoto";
import BusinessSignupMedia from "@/components/business/BusinessSignupMedia";
import BusinessSignupLanding from "@/components/business/BusinessSignupLanding";
import { DEFAULT_BUSINESS_SIGNUP_CONTENT, upgradeBusinessSignupContent } from "@/lib/businessSignupContent";
import "@/app/business/business-onboarding.css";

export default async function BusinessMediaAcceptancePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS !== "true") notFound();
  const scenario = (await searchParams).scenario;
  if (scenario === "configured-video") {
    return <main>
      <h1>Configured business media acceptance</h1>
      <section aria-label="Configured video framing and description" style={{ position: "relative", height: 260 }}>
        <BusinessSignupMedia decorative={false} media={{
          ...DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.media,
          type: "video", src: "/videos/business/business-signup-hero.mp4",
          alt: "Configured business video description", fit: "contain", focalX: 25, focalY: 75,
          poster: { ...DEFAULT_BUSINESS_SIGNUP_CONTENT.hero.media.poster, alt: "" },
        }} />
      </section>
    </main>;
  }
  if (scenario === "content-boundaries") {
    const content = upgradeBusinessSignupContent(DEFAULT_BUSINESS_SIGNUP_CONTENT);
    content.hero.textBlocks = [{ id: "long-token", text: "A".repeat(600), enabled: true, order: 0 }];
    content.selector.visible = false;
    content.sections = [
      { id: "features-without-heading", type: "features", enabled: true, order: 0, placement: "after_hero", heading: "", subheading: "", body: "", variant: "grid", items: [{ id: "feature-one", icon: "heart", heading: "Independent feature heading", body: "Feature details" }] },
      { id: "faq-without-heading", type: "faq", enabled: true, order: 1, placement: "after_hero", heading: "", subheading: "", body: "", variant: "list", items: [{ id: "question-one", question: "Independent question heading", answer: "A useful answer" }] },
    ];
    return <BusinessSignupLanding content={content} />;
  }
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
