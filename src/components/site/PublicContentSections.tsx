import Link from "next/link";
import type { ContentSection } from "@/lib/content";
import RichTextBody from "@/components/site/RichTextBody";
import AutoContentCarousel from "@/components/site/AutoContentCarousel";
import PublicContentCard from "@/components/site/PublicContentCard";

export default function PublicContentSections({ sections, className = "", variant = "default" }: { sections?: ContentSection[]; className?: string; variant?: "default" | "homepage" }) {
  const visible = (Array.isArray(sections) ? sections : []).filter((section) => section && section.is_visible !== false);
  if (!visible.length) return null;
  return <div className={className}>{visible.map((section, index) => {
    const type = section.type || "text";
    const cards = Array.isArray(section.cards) ? section.cards.slice(0, type === "community_carousel" ? 20 : 12) : [];
    if (type === "promo_rail") return null;
    if (type === "banner") return <section key={section.id || index} className="mx-auto my-5 w-full max-w-[1660px] px-4 sm:px-8"><div className="rounded-[18px] bg-[linear-gradient(120deg,#006b88,#0083a6)] px-6 py-8 text-white sm:px-10"><h2 className="font-serif text-3xl">{section.title}</h2>{section.body ? <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-white/80">{section.body}</p> : null}{section.cta_href && section.cta_label ? <Link href={section.cta_href} className="mt-5 inline-flex rounded-lg bg-white px-5 py-3 text-xs font-bold text-teal">{section.cta_label}</Link> : null}</div></section>;
    if (type === "text") return <section key={section.id || index} className="mx-auto my-5 w-full max-w-[1200px] px-4 sm:px-8"><article className="rounded-[18px] border border-plum/10 bg-white p-6 sm:p-8">{section.title ? <h2 className="font-serif text-3xl text-plum">{section.title}</h2> : null}{section.body ? <RichTextBody value={section.body} className={section.title ? "mt-4" : ""} /> : null}</article></section>;
    if (variant === "homepage") return <section key={section.id || index} className="pb-4 pt-3 sm:pb-6">
      {section.title ? <h2 className="font-serif text-[22px] font-semibold leading-none tracking-[-0.025em] text-ink sm:text-[25px]">{section.title}</h2> : null}
      {section.body ? <p className="mt-2 text-[12px] text-ink/65">{section.body}</p> : null}
      {cards.length ? <div className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 lg:gap-4 [&::-webkit-scrollbar]:hidden">{cards.map((card, cardIndex) => <div key={`${card.id || "card"}-${cardIndex}`} className="w-[72vw] max-w-[280px] shrink-0 snap-start sm:w-auto sm:max-w-none"><PublicContentCard card={card} homepage /></div>)}</div> : null}
    </section>;
    if (type === "community_carousel") return <section key={section.id || index} className="mx-auto my-5 w-full max-w-[1660px] px-4 sm:px-8">
      {section.title ? <h2 className="font-serif text-3xl font-semibold text-plum">{section.title}</h2> : null}
      {section.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/65">{section.body}</p> : null}
      <AutoContentCarousel cards={cards} direction={section.scroll_direction === "reverse" ? "reverse" : "forward"} label={section.title} sectionId={section.id}/>
    </section>;
    const carousel = type === "carousel";
    return <section key={section.id || index} className="mx-auto my-5 w-full max-w-[1660px] px-4 sm:px-8">
      {section.title ? <h2 className="font-serif text-3xl font-semibold text-plum">{section.title}</h2> : null}
      {section.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/65">{section.body}</p> : null}
      {cards.length ? <div className={`mt-4 ${carousel ? "flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : `grid gap-4 ${Number(section.columns) === 2 ? "sm:grid-cols-2" : Number(section.columns) === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}`}>
        <div className="contents">{cards.map((card, cardIndex) => <div key={`${card.id || "card"}-${cardIndex}`} className={carousel ? "w-[72vw] max-w-[340px] shrink-0" : "min-w-0"}><PublicContentCard card={card} /></div>)}</div>
      </div> : null}
    </section>;
  })}</div>;
}
