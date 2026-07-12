import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import HelpCenter from "@/components/public/HelpCenter";
import { getContentPage } from "@/lib/content";

export const dynamic = "force-dynamic";
export default async function HelpPage() {
  const page = await getContentPage("help", { slug: "help", title: "Help Center", hero_title: "Answers when you need them.", hero_subtitle: "Search common questions about bookings, payments, accounts, and appointments.", sections: [{ title: "Booking appointments", body: "How do I book?::Choose a salon, style, stylist, and available time, then review and confirm your booking." }] });
  return <main className="min-h-screen bg-cream text-ink"><PublicHeader/><section className="bg-[radial-gradient(circle_at_80%_10%,rgba(224,163,78,.2),transparent_28%),linear-gradient(130deg,#25102d,#5b1a6b)] px-5 py-16 text-center text-white"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber">{page.eyebrow || "How can we help?"}</p><h1 className="mt-3 font-serif text-5xl sm:text-6xl">{page.hero_title || page.title}</h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/75">{page.hero_subtitle}</p></section><HelpCenter sections={page.sections || []}/><PublicFooter/></main>;
}
