const mediaCleanup=async () => {
  const root=(process.env.URL||process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
  if(!root||!process.env.CRON_SECRET)throw new Error("Media cleanup requires URL and CRON_SECRET.");
  const response=await fetch(`${root}/api/media/cleanup`,{method:"POST",headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}});
  if(!response.ok)throw new Error(`Media cleanup returned ${response.status}: ${await response.text()}`);
  return new Response(await response.text(),{status:200,headers:{"content-type":"application/json"}});
};

export default mediaCleanup;
