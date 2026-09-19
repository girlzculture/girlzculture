"use client";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import SafeImage from "@/components/site/SafeImage";
import type { MarketingCopies, MarketingLocale } from "@/lib/businessMarketing";
export type PublicMarketingPost = { id: string; copies: MarketingCopies; photos: { url: string; title: string }[]; booking_path: string; published_at: string };
export default function BusinessMarketingUpdates({ posts }: { posts: PublicMarketingPost[] }) {
  const { locale, translateSource: t, formatDate } = useI18n();
  if (!posts.length) return null;
  return <section id="business-updates" className="mx-auto my-8 max-w-6xl px-4" aria-label={t("Business updates")}>
    <h2 className="font-serif text-2xl text-heading">{t("Business updates")}</h2>
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{posts.map(post => {
      const copy = post.copies[locale as MarketingLocale] || post.copies.en;
      return <article key={post.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
        {post.photos.length ? <div className={post.photos.length > 1 ? "grid grid-cols-2 gap-1" : ""}>{post.photos.map(photo => <SafeImage key={photo.url} src={photo.url} fallbackSrc={photo.url} alt={photo.title || copy.title} className="aspect-[4/3] w-full object-cover"/>)}</div> : null}
        <div className="space-y-3 p-4"><h3 className="font-serif text-xl text-heading" data-no-translate>{copy.title}</h3><p className="text-xs text-muted">{formatDate(post.published_at, { dateStyle: "medium" })}</p><p className="whitespace-pre-wrap break-words text-sm text-ink" data-no-translate>{copy.body}</p><p className="break-words text-xs text-primary" data-no-translate>{copy.tags.join(" ")}</p><Link href={post.booking_path} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">{t("View services and book")}</Link></div>
      </article>;
    })}</div>
  </section>;
}
