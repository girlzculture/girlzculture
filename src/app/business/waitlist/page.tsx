import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import BusinessPhoto from "@/components/business/BusinessPhoto";
import BusinessWaitlistForm from "@/components/business/BusinessWaitlistForm";
import { BusinessSignupHeader, businessPhotoAsset } from "@/components/business/BusinessSignupLanding";
import { interpolateBusinessSignupTemplate } from "@/lib/businessSignupContent";
import { getBusinessSignupContent } from "@/lib/businessSignupContentServer";
import "../business-onboarding.css";

export const metadata: Metadata = {
  title: "Business Waitlist | Girlz Culture",
  robots: { index: false, follow: true },
};

export default async function BusinessWaitlistPage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const [query, content] = await Promise.all([searchParams, getBusinessSignupContent()]);
  const category = typeof query.category === "string" ? content?.categories.find(item => item.id === query.category && item.visible) : null;
  if (!content || !category) redirect("/business/signup");
  if (category.mode === "live_application") redirect("/business/signup");
  const copy = content.waitlist;
  const image = category.waitlist?.image ?? category.image;
  return <main className="business-onboarding business-waitlist">
    <BusinessSignupHeader content={content.header} homeHref="/business/signup" />
    <div className="business-waitlist-card">
      {image.src ? <div className="business-waitlist-photo"><BusinessPhoto photo={businessPhotoAsset(image)} priority /></div> : null}
      <section className="business-waitlist-content" aria-labelledby="business-waitlist-title">
        <Link href="/business/signup" className="business-back-link">All business types</Link>
        {copy.eyebrow ? <p className="business-waitlist-eyebrow">{copy.eyebrow}</p> : null}
        <h1 id="business-waitlist-title">{interpolateBusinessSignupTemplate(category.waitlist?.heading ?? copy.heading, category.name)}</h1>
        <p>{interpolateBusinessSignupTemplate(category.waitlist?.description ?? copy.description, category.name)}</p>
        <BusinessWaitlistForm category={category} copy={copy} />
      </section>
    </div>
  </main>;
}
