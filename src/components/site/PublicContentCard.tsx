import Link from "next/link";
import SafeImage from "@/components/site/SafeImage";
import type { ContentCard } from "@/lib/content";

function CardMedia({
  card,
  homepage = false,
  compact = false,
}: {
  card: ContentCard;
  homepage?: boolean;
  compact?: boolean;
}) {
  const frameClass = homepage
    ? "relative h-[164px] w-full overflow-hidden bg-charcoal sm:h-[178px] lg:h-[190px]"
    : compact
      ? "relative h-[108px] w-full overflow-hidden bg-charcoal sm:h-[124px]"
      : "relative aspect-[4/3] w-full overflow-hidden bg-charcoal";
  const foregroundClass = homepage
    ? "absolute inset-0 h-full w-full object-contain sm:object-cover"
    : "absolute inset-0 h-full w-full object-cover";

  if (card.content_type === "video" && card.media_url) {
    return (
      <div className={frameClass}>
        {homepage ? (
          <video
            src={card.media_url}
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-xl sm:hidden"
          />
        ) : null}
        <video
          src={card.media_url}
          controls
          playsInline
          preload="metadata"
          className={foregroundClass}
        />
      </div>
    );
  }

  if (card.media_url) {
    return (
      <div className={frameClass}>
        {homepage ? (
          <SafeImage
            src={card.media_url}
            fallbackSrc="/images/hero-braids.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-xl sm:hidden"
          />
        ) : null}
        <SafeImage
          src={card.media_url}
          fallbackSrc="/images/hero-braids.jpg"
          alt={card.alt_text || card.title || "Girlz Culture"}
          className={foregroundClass}
        />
      </div>
    );
  }

  return homepage || compact ? <div className={frameClass} /> : null;
}

export default function PublicContentCard({
  card,
  homepage = false,
  compact = false,
}: {
  card: ContentCard;
  homepage?: boolean;
  compact?: boolean;
}) {
  const content = (
    <>
      <CardMedia card={card} homepage={homepage} compact={compact} />
      {card.title || card.body || card.cta_label ? (
        <div className={homepage || compact ? "p-3" : "p-4"}>
          {card.title ? (
            <h3
              className={`font-serif font-semibold text-plum ${
                homepage || compact
                  ? "line-clamp-2 text-[15px] leading-[1.12]"
                  : "text-xl"
              }`}
            >
              {card.title}
            </h3>
          ) : null}
          {card.body ? (
            <p
              className={
                homepage || compact
                  ? "mt-1 line-clamp-2 text-[10px] leading-4 text-ink/65"
                  : "mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/65"
              }
            >
              {card.body}
            </p>
          ) : null}
          {card.cta_label ? (
            <span className="mt-2 inline-flex text-[11px] font-bold text-magenta">
              {card.cta_label} <span aria-hidden="true">→</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
  const classes = `block h-full overflow-hidden border border-plum/10 bg-white shadow-[0_8px_28px_rgba(13,17,20,.06)] ${
    homepage || compact ? "rounded-[14px]" : "rounded-[16px]"
  }`;
  return card.href ? (
    <Link href={card.href} className={classes}>
      {content}
    </Link>
  ) : (
    <article className={classes}>{content}</article>
  );
}
