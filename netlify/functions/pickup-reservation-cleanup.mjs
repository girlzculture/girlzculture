import { monitoredNetlifyFailure } from "./_monitoring.mjs";

const pickupReservationCleanup = async () => {
  try {
    const root = (
      process.env.URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      ""
    ).replace(/\/$/, "");
    if (!root || !process.env.CRON_SECRET) {
      throw new Error("PICKUP_RESERVATION_CLEANUP_NOT_CONFIGURED");
    }
    const response = await fetch(`${root}/api/commerce/pickup-cleanup`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });
    if (!response.ok) {
      throw new Error(
        `PICKUP_RESERVATION_CLEANUP_UPSTREAM_HTTP_${response.status}`,
      );
    }
    return new Response(await response.text(), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return monitoredNetlifyFailure({
      error,
      feature: "pickup-reservations",
      action: "pickup-reservation-cleanup",
      safeMessage: "Pickup reservation cleanup could not finish.",
      provider: "netlify-scheduled-function",
    });
  }
};

export default pickupReservationCleanup;
