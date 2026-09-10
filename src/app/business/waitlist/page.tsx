import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import BusinessPhoto from "@/components/business/BusinessPhoto";
import BusinessWaitlistForm from "@/components/business/BusinessWaitlistForm";
import { waitlistCategory } from "@/lib/businessCategories";
import { BUSINESS_CATEGORY_PHOTOS } from "@/lib/businessSignupMedia";
import "../business-onboarding.css";

export const metadata: Metadata = {
  title: "Business Waitlist | Girlz Culture",
  robots: { index: false, follow: true },
};

export default async function BusinessWaitlistPage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const category = waitlistCategory((await searchParams).category);
  if (!category) redirect("/business/signup");
  return <main className="business-onboarding business-waitlist">
    <header className="business-entry-header">
      <Link href="/business/signup" className="business-wordmark">Girlz Culture</Link>
      <div className="business-entry-login"><span>Already have an account?</span><Link href="/business/login">Log In</Link></div>
    </header>
    <div className="business-waitlist-card">
      <div className="business-waitlist-photo"><BusinessPhoto photo={BUSINESS_CATEGORY_PHOTOS[category.photo]} priority /></div>
      <section className="business-waitlist-content" aria-labelledby="business-waitlist-title">
        <Link href="/business/signup" className="business-back-link">All business types</Link>
        <h1 id="business-waitlist-title">Join the {category.name} waitlist</h1>
        <p>Girlz Culture is expanding into {category.name}. Join the waitlist and we’ll reach out when this business category is ready on Girlz Culture.</p>
        <BusinessWaitlistForm category={category} />
      </section>
    </div>
  </main>;
}
