import { monitoredNetlifyFailure } from "./_monitoring.mjs";
import { runBookingReminderWorker } from "./_booking-reminder-worker.mjs";

const bookingReminders=async (request) => {
  try {
    return await runBookingReminderWorker();
  } catch (error) {
    return monitoredNetlifyFailure({
      request,
      error,
      feature: "booking-notifications",
      action: "booking-reminders",
      safeMessage: "Scheduled booking reminders could not be processed.",
      provider: "netlify-scheduled-function",
    });
  }
};

export default bookingReminders;
