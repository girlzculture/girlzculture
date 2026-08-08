import Link from "next/link";
import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { getPublishedContentPage, getVisibleLegalLinks } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function LegalPoliciesPage() {
  const [page, links] = await Promise.all([getPublishedContentPage("legal"), getVisibleLegalLinks()]);
  const title = page?.hero_title || page?.title || "Legal & Policies";
  const subtitle = page?.hero_subtitle || "Review the policies that apply to Girlz Culture customers, salon partners, and website visitors.";
  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader/>
    <header className="bg-[linear-gradient(130deg,#006b88,#0083a6)] px-4 py-10 text-white sm:px-8 sm:py-16">
      <div className="mx-auto max-w-[1100px]"><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-white/85"><ArrowLeft size={17}/>Back to Home</Link><p className="mt-4 text-[10px] font-bold uppercase tracking-[.18em] text-amber">Girlz Culture</p><h1 className="mt-2 font-serif text-4xl font-semibold sm:text-6xl">{title}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">{subtitle}</p></div>
    </header>
    <section className="mx-auto max-w-[1100px] px-4 py-7 sm:px-8 sm:py-10" aria-labelledby="policy-list-heading">
      <h2 id="policy-list-heading" className="font-serif text-2xl font-semibold text-plum">Choose a document</h2>
      <p className="mt-2 text-sm text-ink/60">Each policy opens on its own shareable page. Use your browser Back button or the Legal & Policies link to return here.</p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {links.map(([label, href]) => <li key={href}><Link href={href} className="group flex min-h-20 items-center gap-4 rounded-[16px] border border-plum/10 bg-white p-4 shadow-[0_8px_24px_rgba(13,17,20,.04)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush/70 text-magenta"><FileText size={19}/></span><span className="min-w-0 flex-1 font-serif text-lg font-semibold text-plum">{label}</span><ChevronRight className="shrink-0 text-plum/45 transition-transform group-hover:translate-x-1" size={20}/></Link></li>)}
      </ul>
      {!links.length ? <p className="mt-5 rounded-[16px] border border-dashed border-plum/20 bg-white p-6 text-sm text-ink/60">No legal documents are published yet.</p> : null}
    </section>
    <PublicFooter/>
  </main>;
}
