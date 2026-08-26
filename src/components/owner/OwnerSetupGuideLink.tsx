"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText } from "lucide-react";

export default function OwnerSetupGuideLink() {
  const pathname = usePathname();
  const isMyPage = pathname === "/salon/dashboard/my-page" || pathname.startsWith("/salon/dashboard/my-page/");
  if (!isMyPage) return null;

  return (
    <div data-owner-setup-guide className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-plum/10 bg-white/75 px-4 py-3">
      <div>
        <p className="text-[11px] font-bold text-plum">Need help setting up your page?</p>
        <p className="mt-0.5 text-[9px] leading-4 text-ink/55">Follow the mobile, tablet, or desktop guide for photos, services, staff, products, hours, and publishing.</p>
      </div>
      <Link href="/salon/setup-guide" target="_blank" className="inline-flex min-h-9 items-center gap-2 rounded-[7px] border border-magenta px-3 text-[10px] font-bold text-magenta">
        <BookOpenText size={14} />Open setup guide
      </Link>
    </div>
  );
}