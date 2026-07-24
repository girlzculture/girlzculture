import type { Metadata } from "next";
import GuestBookingRecovery from "@/components/booking/GuestBookingRecovery";
import { PublicHeader } from "@/components/site/PublicChrome";

export const metadata: Metadata = {
  title: "Recover Booking | Girlz Culture",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default function GuestBookingRecoveryPage() {
  return (
    <div className="min-h-screen bg-cream pb-16">
      <PublicHeader />
      <div className="px-4 py-10 sm:px-6">
        <GuestBookingRecovery />
      </div>
    </div>
  );
}
