import Link from "next/link";
import SafeImage from "@/components/site/SafeImage";
import type { ContentCard, ContentSection } from "@/lib/content";

function CardMedia({ card }: { card: ContentCard }) {
  if (card.content_type === "video" && card.media_url) {
    return <video src={card.media_url} controls playsInline preload="metadata" className="aspect-[4/3] w-full bg-ink object-cover" />;
  }
  if (card.media_url) {
    return <SafeImage src={card.media_url} fallbackSrc="/images/hero-braids.jpg" alt={card.title || "Girlz Culture"} className="aspect-[4/3] w-full object-cover" />;
  }
  return null;
}

function ContentCardView({ card }: { card: ContentCard }) {
  const content = <>
    <CardMedia card={card} />
    {card.title || card.body ? <div className="p-4">
      {card.title ? <h3 className="font-serif text-xl font-semibold text-plum">{card.title}</h3> : null}
      {card.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/65">{card.body}</p> : null}
    </div> : null}
  </>;
  const classes = "block h-full overflow-hidden rounded-[16px] border border-plum/10 bg-white shadow-[0_8px_28px_rgba(26,18,32,.06)]";
  return card.href ? <Link href={card.href} className={classes}>{content}</Link> : <article className={classes}>{content}</article>;
}

export default function PublicContentSections({ sections, className = "" }: { sections?: ContentSection[]; className?: string }) {
  const visible = (Array.isArray(sections) ? sections : []).filter((section) => section && section.is_visible !== false);
  if (!visible.length) return null;
  return <div className={className}>{visible.map((section, index) => {
    const type = section.type || "text";
    const cards = Array.isArray(section.cards) ? section.cards.slice(0, type === "community_carousel" ? 20 : 12) : [];
    if (type === "banner") return <section key={section.id || index} className="mx-auto my-5 w-full max-w-[1660px] px-4 sm:px-8"><div className="rounded-[18px] bg-[linear-gradient(120deg,#311138,#5b1a6b)] px-6 py-8 text-white sm:px-10"><h2 className="font-serif text-3xl">{section.title}</h2>{section.body ? <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-white/75">{section.body}</p> : null}{section.cta_href && section.cta_label ? <Link href={section.cta_href} className="mt-5 inline-flex rounded-lg bg-magenta px-5 py-3 text-xs font-bold">{section.cta_label}</Link> : null}</div></section>;
    if (type === "text") return <section key={section.id || index} className="mx-auto my-5 w-full max-w-[1200px] px-4 sm:px-8"><article className="rounded-[18px] border border-plum/10 bg-white p-6 sm:p-8"><h2 className="font-serif text-3xl text-plum">{section.title}</h2>{section.body ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-ink/70">{section.body}</p> : null}</article></section>;
    const carousel = type === "carousel" || type === "community_carousel";
    const renderedCards = type === "community_carousel" && cards.length > 1 ? [...cards, ...cards] : cards;
    return <section key={section.id || index} className="mx-auto my-5 w-full max-w-[1660px] px-4 sm:px-8">
      {section.title ? <h2 className="font-serif text-3xl font-semibold text-plum">{section.title}</h2> : null}
      {section.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/65">{section.body}</p> : null}
      {cards.length ? <div className={`mt-4 ${carousel ? type === "community_carousel" ? "overflow-hidden" : "flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : `grid gap-4 ${Number(section.columns) === 2 ? "sm:grid-cols-2" : Number(section.columns) === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}`}>
        <div className={type === "community_carousel" ? "cms-community-track flex w-max gap-4 pb-3" : "contents"}>{renderedCards.map((card, cardIndex) => <div key={`${card.id || "card"}-${cardIndex}`} className={carousel ? "w-[72vw] max-w-[340px] shrink-0" : "min-w-0"}><ContentCardView card={card} /></div>)}</div>
      </div> : null}
    </section>;
  })}</div>;
}
