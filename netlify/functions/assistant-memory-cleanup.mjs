import { createClient } from "@supabase/supabase-js";
import { monitoredNetlifyFailure } from "./_monitoring.mjs";

export default async function cleanup(_request, context) {
  // Scheduled functions run only on published deploys. Also guard manual
  // invocation so held candidates and Deploy Previews cannot purge records.
  if (context?.deploy?.context !== "production" || !context.deploy.published) return Response.json({skipped:true});
  try {
    const url = Netlify.env.get("NEXT_PUBLIC_SUPABASE_URL");
    const key = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("ASSISTANT_MEMORY_CLEANUP_NOT_CONFIGURED");
    const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const result = await admin.from("gc_assistant_memory").delete({count:"exact"}).lte("expires_at",new Date().toISOString()).abortSignal(AbortSignal.timeout(20000));
    if (result.error) throw new Error("ASSISTANT_MEMORY_CLEANUP_FAILED");
    return Response.json({deleted:result.count || 0});
  } catch (error) {
    return monitoredNetlifyFailure({error,feature:"gc-assistant",action:"memory-retention",safeMessage:"Expired conversation context could not be removed.",provider:"netlify-scheduled-function"});
  }
}
export const config = {schedule:"@daily"};
