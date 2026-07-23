import { monitoredNetlifyFailure } from "./_monitoring.mjs";

const bookingReminders=async () => {
  try {
    const root=(process.env.URL||process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
    if(!root||!process.env.INTERNAL_API_SECRET)throw new Error("REMINDER_WORKER_NOT_CONFIGURED");
    const response=await fetch(`${root}/api/bookings/reminders`,{method:"POST",headers:{"x-internal-secret":process.env.INTERNAL_API_SECRET}});
    if(!response.ok)throw new Error(`REMINDER_UPSTREAM_HTTP_${response.status}`);
    return new Response(await response.text(),{status:200,headers:{"content-type":"application/json"}});
  } catch (error) {
    return monitoredNetlifyFailure({
      error,
      feature: "booking-notifications",
      action: "booking-reminders",
      safeMessage: "Scheduled booking reminders could not be processed.",
      provider: "netlify-scheduled-function",
    });
  }
};

export default bookingReminders;
