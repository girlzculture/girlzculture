"use client";

import { usePathname } from "next/navigation";

/**
 * Keeps route-specific salon-dashboard presentation fixes close to the shell
 * without changing shared public tables or the desktop finance experience.
 */
export default function OwnerDashboardResponsiveBridge() {
  const pathname = usePathname();
  const bookingWorkspace = pathname === "/salon/dashboard/bookings" || pathname.startsWith("/salon/dashboard/bookings/");

  return (
    <style jsx global>{`
      div:has(> [data-owner-device-alerts-hidden]) {
        display: none !important;
      }

      ${bookingWorkspace ? `
      @media (min-width: 1024px) and (max-width: 1279px) {
        main .space-y-3.lg\\:hidden {
          display: block !important;
        }

        main table.lg\\:table {
          display: none !important;
        }

        main h1.font-serif {
          font-size: 2.15rem !important;
          line-height: 1.05 !important;
        }
      }
      ` : ""}
    `}</style>
  );
}