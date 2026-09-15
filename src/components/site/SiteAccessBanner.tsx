import Link from "next/link";
import { SITE_ACCESS_EXIT_PATH } from "@/lib/marketplaceLaunchCore";

export default function SiteAccessBanner() {
  return (
    <aside
      aria-label="Marketplace demonstration notice"
      className="relative z-[100] flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-plum px-4 py-2 text-center text-[11px] font-semibold text-white"
    >
      <span>
        Girlz Culture demonstration — sample marketplace content is visible;
        booking and payment are unavailable.
      </span>
      <Link href="/site-access/business-demo" className="underline underline-offset-4">
        Explore the sample business dashboard
      </Link>
      {/* A native form requires deliberate submission and replaces the layout.
          GET/HEAD requests, including prefetch, cannot end the session. */}
      <form action={SITE_ACCESS_EXIT_PATH} method="post">
        <button
          type="submit"
          className="cursor-pointer underline decoration-white/60 underline-offset-4 hover:decoration-white"
        >
          Exit demonstration
        </button>
      </form>
    </aside>
  );
}
