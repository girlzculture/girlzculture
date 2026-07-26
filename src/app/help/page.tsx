import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import HelpCenter from "@/components/public/HelpCenter";
import { getContentPage } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";
import { getEngineBoolean } from "@/lib/engineConfigServer";

export const dynamic = "force-dynamic";
export default async function HelpPage() {
  const [page,searchEnabled] = await Promise.all([
    getContentPage("help", { slug: "help", title: "Help Center", hero_title: "Answers when you need them.", hero_subtitle: "Search common questions about bookings, payments, accounts, and appointments.", sections: [{ title: "Booking appointments", body: "How do I book?::Choose a salon, style, stylist, and available time, then review and confirm your booking." }] }),
    getEngineBoolean("content.faq_search_enabled",true),
  ]);
  const faqSections = (page.sections || []).filter((section) => !section.type || section.type === "text");
  const customSections = (page.sections || []).filter((section) => section.type && section.type !== "text");
  return <main className="min-h-screen bg-cream text-ink"><PublicHeader/><section className="bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,.18),transparent_28%),linear-gradient(130deg,#006b88,#0083a6)] px-5 py-16 text-center text-white"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/80">{page.eyebrow || "How can we help?"}</p><h1 className="mt-3 font-serif text-5xl sm:text-6xl">{page.hero_title || page.title}</h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/80">{page.hero_subtitle}</p></section><HelpCenter sections={faqSections} searchEnabled={searchEnabled}/><PublicContentSections sections={customSections}/><PublicFooter/></main>;
}
