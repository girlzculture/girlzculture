import type { Metadata } from "next";
import GuestBookingManager from "@/components/booking/GuestBookingManager";
import { PublicHeader } from "@/components/site/PublicChrome";

export const metadata: Metadata = {
  title: "Manage Booking | Girlz Culture",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default async function GuestBookingManagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="min-h-screen bg-cream pb-16">
      <PublicHeader />
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <GuestBookingManager token={decodeURIComponent(token)} />
      </div>
    </div>
  );
}
