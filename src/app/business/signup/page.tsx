import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BusinessSignupLanding from "@/components/business/BusinessSignupLanding";
import { getBusinessSignupContent } from "@/lib/businessSignupContentServer";
import "../business-onboarding.css";

export const metadata: Metadata = {
  title: "Grow Your Beauty Business | Girlz Culture",
  description: "Get discovered, attract more clients, and manage your beauty business with Girlz Culture.",
  alternates: { canonical: "https://girlzculture.com/business/signup" },
  openGraph: { url: "https://girlzculture.com/business/signup", title: "Grow Your Beauty Business" },
};

export default async function BusinessSignupPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[] }> }) {
  const [query, content] = await Promise.all([searchParams, getBusinessSignupContent()]);
  if (!content) notFound();
  return <BusinessSignupLanding content={content} plan={query.plan} />;
}
