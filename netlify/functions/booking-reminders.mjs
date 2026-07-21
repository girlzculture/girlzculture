const bookingReminders=async () => {
  const root=(process.env.URL||process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
  if(!root||!process.env.INTERNAL_API_SECRET)throw new Error("Reminder worker requires URL and INTERNAL_API_SECRET.");
  const response=await fetch(`${root}/api/bookings/reminders`,{method:"POST",headers:{"x-internal-secret":process.env.INTERNAL_API_SECRET}});
  if(!response.ok)throw new Error(`Reminder worker returned ${response.status}: ${await response.text()}`);
  return new Response(await response.text(),{status:200,headers:{"content-type":"application/json"}});
};

export default bookingReminders;
