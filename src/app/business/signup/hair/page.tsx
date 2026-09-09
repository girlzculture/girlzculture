import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import SalonSignup from "@/components/SalonSignup";

export const metadata: Metadata = {
  title: "Create Your Business Account | Girlz Culture",
  alternates: { canonical: "https://girlzculture.com/business/signup/hair" },
  robots: { index: false, follow: true },
};

export default function BusinessAccountPage() {
  return <main className="min-h-screen bg-cream px-4 py-7 text-ink sm:py-12">
    <div className="mx-auto max-w-2xl rounded-2xl border border-plum/10 bg-white p-5 sm:p-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="font-serif text-3xl font-bold text-plum">Girlz Culture</Link>
        <Link href="/business/login" className="inline-flex min-h-11 items-center font-semibold text-magenta">Log In</Link>
      </header>
      <p className="mb-3 text-sm font-semibold gc-text-secondary">Hair Salon &amp; Braiding</p>
      <h1 className="font-serif text-4xl font-semibold text-plum">Create Your Business Account</h1>
      <p className="mb-7 mt-3 gc-text-secondary">Start your application and grow your business with Girlz Culture.</p>
      <Suspense fallback={<p>Loading account form…</p>}><SalonSignup /></Suspense>
    </div>
  </main>;
}
