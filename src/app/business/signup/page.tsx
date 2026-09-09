import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, TrendingUp, UsersRound, HeartHandshake, Store, ShieldCheck } from "lucide-react";
import BusinessSignupMedia from "@/components/business/BusinessSignupMedia";
import BusinessTypeSelector from "@/components/business/BusinessTypeSelector";
import { businessOnboardingHref } from "@/lib/businessOnboarding";
import "../business-onboarding.css";

export const metadata: Metadata = {
  title: "Grow Your Beauty Business | Girlz Culture",
  description: "Get discovered, attract more clients, and manage your beauty business with Girlz Culture.",
  alternates: { canonical: "https://girlzculture.com/business/signup" },
  openGraph: { url: "https://girlzculture.com/business/signup", title: "Grow Your Beauty Business" },
};

const benefits = [[CalendarCheck, "Get More Bookings"], [TrendingUp, "Grow Your Brand"], [UsersRound, "Reach New Clients"], [HeartHandshake, "Join a Supportive Community"]] as const;
const trust = [
  [Store, "A Platform Built for You", "Designed for beauty and wellness businesses like yours."],
  [ShieldCheck, "Safe & Secure", "Your data and business information are always protected."],
  [HeartHandshake, "More Than a Platform", "Join a growing community of entrepreneurs, creators, and professionals."],
] as const;

export default async function BusinessSignupPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[] }> }) {
  const query = await searchParams;
  return <main className="business-onboarding">
    <section className="business-hero" aria-labelledby="business-hero-title">
      <BusinessSignupMedia />
      <div className="business-hero-shade" />
      <header className="business-entry-header">
        <Link href="/" className="business-wordmark">Girlz Culture</Link>
        <div className="business-entry-login"><span>Already have an account?</span><Link href="/business/login">Log In</Link></div>
      </header>
      <div className="business-hero-copy">
        <h1 id="business-hero-title">Grow Your Beauty Business</h1>
        <p>Get discovered, attract more clients, manage your business all in one place.</p>
        <ul>{benefits.map(([Icon, label]) => <li key={label}><Icon size={20} aria-hidden="true" />{label}</li>)}</ul>
      </div>
    </section>
    <div className="business-lower">
      <BusinessTypeSelector continueHref={businessOnboardingHref("/business/signup/hair", query.plan)} />
      <section className="business-trust" aria-label="Built for your business">{trust.map(([Icon, title, description]) => <div key={title}><Icon size={29} aria-hidden="true" /><h2>{title}</h2><p>{description}</p></div>)}</section>
    </div>
  </main>;
}
