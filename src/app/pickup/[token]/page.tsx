import type { Metadata } from "next";
import PickupReservationManager from "@/components/commerce/PickupReservationManager";
import {
  CustomerBottomNav,
  PublicFooter,
  PublicHeader,
} from "@/components/site/PublicChrome";

export const metadata: Metadata = {
  title: "Manage pickup reservation | Girlz Culture",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PickupReservationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-light-gray pb-20 text-charcoal md:pb-0">
      <PublicHeader />
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <PickupReservationManager token={token} />
      </div>
      <PublicFooter reserveMobileNavigation />
      <CustomerBottomNav active="bookings" />
    </main>
  );
}
