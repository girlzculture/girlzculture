import type { Metadata } from "next";
import Home from "@/app/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Explore Girlz Culture salons",
  alternates: { canonical: "/site-access" },
  robots: { index: false, follow: false, noarchive: true },
};

export default function SiteAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Home searchParams={searchParams} />;
}
