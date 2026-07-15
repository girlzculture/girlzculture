import { Quote } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { getContentPage } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";

export const dynamic = "force-dynamic";

export default async function TestimonialsPage() {
  const page = await getContentPage("testimonials", {
    slug: "testimonials",
    title: "Testimonials",
    hero_title: "Customer testimonials",
    hero_subtitle: "Verified customer stories will be published here.",
    sections: [],
  });
  const testimonials = (page.sections || []).filter((section) => !section.type || section.type === "text");
  const customSections = (page.sections || []).filter((section) => section.type && section.type !== "text");

  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader />
    <section className="relative overflow-hidden bg-plum px-5 py-16 text-center text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(214,24,107,.35),transparent_30%),radial-gradient(circle_at_85%_80%,rgba(224,163,78,.22),transparent_28%)]" />
      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber">{page.eyebrow || "Customer stories"}</p>
        <h1 className="mx-auto mt-3 max-w-4xl font-serif text-5xl leading-[.95] sm:text-6xl">{page.hero_title || page.title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/70">{page.hero_subtitle}</p>
      </div>
    </section>
    <PublicContentSections sections={customSections} />
    <section className="mx-auto grid w-full max-w-[1320px] gap-5 px-5 py-12 sm:px-8 md:grid-cols-2 lg:grid-cols-3 lg:py-16">
      {testimonials.map((testimonial, index) => <article key={`${testimonial.title}-${index}`} className="flex min-h-[280px] flex-col rounded-3xl border border-plum/10 bg-white p-6 shadow-[0_14px_45px_rgba(26,18,32,.06)]">
        <Quote className="text-magenta" size={30} />
        <blockquote className="mt-4 flex-1 font-serif text-2xl leading-9 text-plum">“{testimonial.body}”</blockquote>
        <p className="mt-6 border-t border-plum/10 pt-4 text-sm font-bold text-ink">{testimonial.title}</p>
      </article>)}
      {!testimonials.length ? <div className="rounded-3xl border border-dashed border-plum/20 bg-white/60 p-8 text-center md:col-span-2 lg:col-span-3">
        <Quote className="mx-auto text-magenta" />
        <h2 className="mt-4 font-serif text-2xl text-plum">No testimonials published yet</h2>
        <p className="mt-2 text-sm text-ink/60">Approved customer stories will appear here after an admin publishes them.</p>
      </div> : null}
    </section>
    <PublicFooter />
  </main>;
}
