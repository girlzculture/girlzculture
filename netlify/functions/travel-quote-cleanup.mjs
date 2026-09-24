import { createClient } from "@supabase/supabase-js";
import { monitoredNetlifyFailure } from "./_monitoring.mjs";

export default async function cleanup(_request, context) {
  if (context?.deploy?.context !== "production" || !context.deploy.published) return Response.json({skipped:true});
  try {
    const url=Netlify.env.get("NEXT_PUBLIC_SUPABASE_URL"),key=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!key)throw new Error("TRAVEL_RETENTION_NOT_CONFIGURED");
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const result=await admin.rpc("expire_business_travel_quotes").abortSignal(AbortSignal.timeout(20000));
    if(result.error)throw new Error("TRAVEL_RETENTION_FAILED");
    return Response.json({deleted:result.data});
  }catch(error){
    return monitoredNetlifyFailure({error,feature:"booking-location",action:"travel-retention",safeMessage:"Expired address quotes could not be removed.",provider:"netlify-scheduled-function"});
  }
}
export const config={schedule:"@hourly"};
