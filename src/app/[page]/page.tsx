import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { getContentPage, getPublishedContentPage, LEGAL_LINKS } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";
import SalonPage from "@/app/salon/[slug]/page";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalonPublicMetadata } from "@/lib/salonPublicMetadata";

const pages: Record<string, { title: string; body: string }> = {
  safety: { title: "Safety & Trust", body: "Girlz Culture is committed to verified professionals, transparent pricing, and secure booking experiences." },
  tools: { title: "Tools & Resources", body: "Guides and resources designed to help salon partners grow their business." },
  terms: { title: "Terms of Service", body: "" },
  privacy: { title: "Privacy Policy", body: "" },
  accessibility: { title: "Accessibility Statement", body: "" },
  "cookie-notice": { title: "Cookie & Tracking Notice", body: "" },
  "deposit-refund-policy": { title: "Deposit & Refund Policy", body: "" },
  "salon-partner-agreement": { title: "Salon Partner Agreement", body: "" },
  "photo-content-consent": { title: "Photo & Content Consent", body: "" },
  "message-monitoring-disclosure": { title: "Message Monitoring Disclosure", body: "" },
  "do-not-sell-or-share": { title: "Do Not Sell or Share My Information", body: "" },
  "community-guidelines": { title: "Community Guidelines", body: "" },
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page: slug } = await params;
  if (pages[slug]) return { title: pages[slug].title };
  return (
    (await getSalonPublicMetadata(slug, "vanity_slug")) || {
      title: "Page not found",
      robots: { index: false, follow: false },
    }
  );
}

export default async function InfoPage({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page: slug } = await params;
  const fallback = pages[slug];
  if (!fallback) {
    const admin = getSupabaseAdmin();
    const vanity = await admin
      .from("salons")
      .select("slug")
      .eq("vanity_slug", slug)
      .eq("status", "Active")
      .eq("is_discoverable", true)
      .maybeSingle();
    if (vanity.error) throw vanity.error;
    if (vanity.data?.slug) {
      return SalonPage({
        params: Promise.resolve({ slug: vanity.data.slug }),
        searchParams,
      });
    }
    const redirect = await admin
      .from("salon_slug_redirects")
      .select("new_slug")
      .eq("route_scope", "vanity")
      .eq("old_slug", slug)
      .is("retired_at", null)
      .maybeSingle();
    if (redirect.error) throw redirect.error;
    if (redirect.data?.new_slug) permanentRedirect(`/${redirect.data.new_slug}`);
    notFound();
  }
  const isLegal = LEGAL_LINKS.some(([, , legalSlug]) => legalSlug === slug);
  const page = isLegal
    ? await getPublishedContentPage(slug)
    : await getContentPage(slug, { slug, title: fallback.title, hero_title: fallback.title, hero_subtitle: fallback.body, sections: [{ title: "Our Commitment", body: fallback.body }] });
  if (!page) notFound();
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
