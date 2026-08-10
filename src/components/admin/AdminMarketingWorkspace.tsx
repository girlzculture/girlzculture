"use client";

import Link from "next/link";
import { BadgeDollarSign, Boxes, Clapperboard, Home, TicketPercent } from "lucide-react";

const workspaces = [
  { id: "featured", label: "Featured Salon campaigns", description: "Schedule paid and eligible salon placements without opening other campaign editors.", icon: BadgeDollarSign },
  { id: "products", label: "Featured Products", description: "Manage product placement, eligibility, targeting, and schedule.", icon: Boxes },
  { id: "trending", label: "Trending Picks", description: "Manage editorial and video-led trending campaigns.", icon: Clapperboard },
  { id: "homepage", label: "Homepage promotions", description: "Review homepage marketing placement and salon eligibility.", icon: Home },
  { id: "promo-codes", label: "Promo codes", description: "Create, schedule, and review marketplace promotional codes.", icon: TicketPercent },
] as const;

export default function AdminMarketingWorkspace({ overview }: { overview?: React.ReactNode }) {
  return <div data-admin-record-landing className="space-y-5">
    <section className="rounded-[14px] border border-plum/10 bg-white p-5"><div><h2 className="font-serif text-2xl text-plum">Campaign workspaces</h2><p className="mt-1 text-xs leading-5 text-ink/55">Choose one campaign type. Its full editor opens on a dedicated page and returns here when complete.</p></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workspaces.map(({ id, label, description, icon: Icon }) => <Link key={id} href={`/admin/marketing/${id}?return=${encodeURIComponent("/admin/marketing")}`} className="rounded-xl border border-plum/10 p-4 transition hover:border-magenta hover:bg-blush/20"><span className="grid h-10 w-10 place-items-center rounded-full bg-blush text-magenta"><Icon size={18}/></span><h3 className="mt-3 font-serif text-xl text-plum">{label}</h3><p className="mt-1 text-xs leading-5 text-ink/55">{description}</p><span className="mt-3 inline-flex text-xs font-bold text-magenta">Open workspace →</span></Link>)}</div></section>
    {overview ? <section aria-label="Marketing summary" className="space-y-5">{overview}</section> : null}
  </div>;
}
