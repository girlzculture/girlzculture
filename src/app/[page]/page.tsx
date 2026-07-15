import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { getContentPage } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";

const pages: Record<string, { title: string; body: string }> = {
  safety: { title: "Safety & Trust", body: "Girlz Culture is committed to verified professionals, transparent pricing, and secure booking experiences." },
  tools: { title: "Tools & Resources", body: "Guides and resources designed to help salon partners grow their business." },
  terms: { title: "Terms of Service", body: "" },
  privacy: { title: "Privacy Policy", body: "" },
  accessibility: { title: "Accessibility Statement", body: "" },
  "cookie-notice": { title: "Cookie / Tracking Notice", body: "" },
  "deposit-refund-policy": { title: "Deposit & Refund Policy", body: "" },
  "salon-partner-agreement": { title: "Salon Partner Agreement", body: "" },
  "photo-content-consent": { title: "Photo & Content Consent", body: "" },
  "message-monitoring-disclosure": { title: "Message Monitoring Disclosure", body: "" },
  "do-not-sell-or-share": { title: "Do Not Sell or Share My Information", body: "" },
  "community-guidelines": { title: "Community / Content Guidelines", body: "" },
};

export const dynamic = "force-dynamic";

export default async function InfoPage({ params }: { params: Promise<{ page: string }> }) {
  const { page: slug } = await params;
  const fallback = pages[slug];
  if (!fallback) notFound();
  const page = await getContentPage(slug, { slug, title: fallback.title, hero_title: fallback.title, hero_subtitle: fallback.body, sections: [{ title: "Our Commitment", body: fallback.body }] });
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <section className="bg-[radial-gradient(circle_at_80%_15%,rgba(224,163,78,.2),transparent_28%),linear-gradient(130deg,#25102d,#5b1a6b)] px-5 py-20 text-center text-white">
      {page.eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber">{page.eyebrow}</p> : null}
      <h1 className="mt-3 font-serif text-5xl sm:text-6xl">{page.hero_title || page.title}</h1>
      {page.hero_subtitle ? <p className="mx-auto mt-5 max-w-2xl leading-7 text-white/70">{page.hero_subtitle}</p> : null}
    </section>
    <PublicContentSections sections={page.sections?.length ? page.sections : [{ type: "text", title: page.title, body: fallback.body }]} />
    <div className="px-5 pb-12 text-center"><Link href="/contact" className="inline-flex rounded-lg bg-magenta px-6 py-3 text-sm font-bold text-white">Contact Girlz Culture</Link></div>
    <PublicFooter />
  </main>;
}
