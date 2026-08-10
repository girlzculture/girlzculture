"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";

export function OwnerDetailHeader({
  title,
  subtitle,
  fallbackHref,
  status,
  hideOnMobile = false,
}: {
  title: string;
  subtitle?: string;
  fallbackHref: string;
  status?: string;
  hideOnMobile?: boolean;
}) {
  const router = useRouter();
  return (
    <header
      className={`${hideOnMobile ? "hidden lg:flex" : "flex"} mb-5 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between`}
    >
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => router.push(fallbackHref)}
          className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-plum/15 bg-white px-4 text-xs font-bold text-plum"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back
        </button>
        <h1 className="font-serif text-[34px] font-semibold leading-none tracking-[-.035em] text-plum sm:text-[46px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/65">{subtitle}</p> : null}
      </div>
      {status ? (
        <span className="w-fit rounded-full bg-blush px-3 py-1.5 text-[10px] font-bold text-plum">
          {status}
        </span>
      ) : null}
    </header>
  );
}

export function OwnerSectionCard({
  href,
  icon: Icon,
  title,
  description,
  meta,
  status,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  meta?: string;
  status?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-40 flex-col rounded-[14px] border border-plum/10 bg-white p-5 shadow-[0_5px_18px_rgba(13,17,20,.035)] transition hover:-translate-y-0.5 hover:border-magenta/35 focus-visible:outline-2 focus-visible:outline-magenta"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-blush text-magenta">
          <Icon aria-hidden="true" size={20} />
        </span>
        {status ? (
          <span className="rounded-full bg-cream px-2.5 py-1 text-[9px] font-bold text-plum">
            {status}
          </span>
        ) : null}
      </span>
      <span className="mt-4 flex items-center justify-between gap-3">
        <span className="font-serif text-xl text-plum">{title}</span>
        <ChevronRight aria-hidden="true" size={17} className="text-magenta" />
      </span>
      <span className="mt-2 text-xs leading-5 text-ink/60">{description}</span>
      {meta ? <span className="mt-auto pt-3 text-[10px] font-semibold text-ink/45">{meta}</span> : null}
    </Link>
  );
}
