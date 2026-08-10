import Link from "next/link";
import SafeImage from "@/components/site/SafeImage";
import SalonDistance from "@/components/public/SalonDistance";
import type { ContentCard } from "@/lib/content";

function CardMedia({ card, homepage = false }: { card: ContentCard; homepage?: boolean }) {
  const mediaClass = homepage ? "h-[126px] w-full bg-blush object-cover lg:h-[118px] 2xl:h-[132px]" : "aspect-[4/3] w-full bg-ink object-cover";
  if (card.content_type === "video" && card.media_url) {
    return <video src={card.media_url} controls playsInline preload="metadata" className={mediaClass} />;
  }
  if (card.media_url) {
    return <SafeImage src={card.media_url} fallbackSrc="/images/hero-braids.jpg" alt={card.alt_text || card.title || "Girlz Culture"} className={mediaClass} />;
  }
  return homepage ? <div className={mediaClass} /> : null;
}

export default function PublicContentCard({ card, homepage = false }: { card: ContentCard; homepage?: boolean }) {
  const representsSalon = ["salon", "campaign"].includes(String(card.association_type || "")) || Boolean(card.salon_id || card.campaign_id) || /^\/salon\//.test(String(card.href || ""));
  const content = <>
    <CardMedia card={card} homepage={homepage} />
    {card.title || card.body ? <div className={homepage ? "p-3" : "p-4"}>
      {card.title ? <h3 className={`font-serif font-semibold text-plum ${homepage ? "text-[15px] leading-tight" : "text-xl"}`}>{card.title}</h3> : null}
      {card.body || (homepage && representsSalon) ? <p className={homepage ? "mt-1 line-clamp-2 text-[10px] leading-4 text-ink/60" : "mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/65"}>{homepage && representsSalon ? <><span className="sm:hidden"><SalonDistance latitude={card.target_latitude} longitude={card.target_longitude}/></span>{card.body ? <span className="hidden sm:inline">{card.body}</span> : null}</> : card.body}</p> : null}
      {card.cta_label ? <span className="mt-3 inline-flex text-xs font-bold text-magenta">{card.cta_label} <span aria-hidden="true">→</span></span> : null}
    </div> : null}
  </>;
  const classes = `block h-full overflow-hidden border border-plum/10 bg-white shadow-[0_8px_28px_rgba(13,17,20,.06)] ${homepage ? "rounded-[14px]" : "rounded-[16px]"}`;
  return card.href ? <Link href={card.href} className={classes}>{content}</Link> : <article className={classes}>{content}</article>;
}
