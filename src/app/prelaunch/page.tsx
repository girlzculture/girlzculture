import Link from "next/link";
import type { Metadata } from "next";
import { getEngineText } from "@/lib/engineConfigServer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Girlz Culture — Founding businesses", robots: { index: false, follow: false } };

export default async function PrelaunchPage() {
  const [title, description] = await Promise.all([
    getEngineText("marketplace.prelaunch_title", "A new home for your beauty business", 160),
    getEngineText("marketplace.prelaunch_description", "Girlz Culture is onboarding founding beauty businesses. Our customer marketplace is preparing to launch. Customer booking and payment are not available yet.", 800),
  ]);
  return <div className="min-h-dvh bg-ivory text-ink">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
      <Link href="/" className="font-serif text-2xl font-bold text-plum">Girlz Culture</Link>
      <Link href="/business/login" className="rounded-lg border border-plum px-5 py-3 text-sm font-semibold">Business log in</Link>
    </header>
    <main className="mx-auto max-w-3xl px-6 py-20 text-center">
      <p className="text-sm font-semibold text-magenta">For beauty and wellness businesses</p>
      <h1 className="mt-5 font-serif text-4xl font-semibold text-plum sm:text-6xl">{title}</h1>
      <p className="mt-6 text-lg leading-8">{description}</p>
      <Link href="/business/signup" className="mt-9 inline-flex min-h-12 items-center rounded-xl bg-magenta px-7 py-3 font-semibold text-white">Join as a founding business</Link>
    </main>
    <footer className="mx-auto flex max-w-3xl flex-wrap justify-center gap-6 px-6 py-8 text-sm">
      <Link href="/help">Help</Link><Link href="/legal">Girlz Culture policies</Link>
    </footer>
  </div>;
}
