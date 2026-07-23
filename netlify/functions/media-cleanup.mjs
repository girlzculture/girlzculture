import { monitoredNetlifyFailure } from "./_monitoring.mjs";

const mediaCleanup=async () => {
  try {
    const root=(process.env.URL||process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
    if(!root||!process.env.CRON_SECRET)throw new Error("MEDIA_CLEANUP_NOT_CONFIGURED");
    const response=await fetch(`${root}/api/media/cleanup`,{method:"POST",headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}});
    if(!response.ok)throw new Error(`MEDIA_CLEANUP_UPSTREAM_HTTP_${response.status}`);
    return new Response(await response.text(),{status:200,headers:{"content-type":"application/json"}});
  } catch (error) {
    return monitoredNetlifyFailure({
      error,
      feature: "media",
      action: "media-cleanup",
      safeMessage: "Staged media cleanup could not finish.",
      provider: "netlify-scheduled-function",
    });
  }
};

export default mediaCleanup;
