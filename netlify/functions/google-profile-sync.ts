import {monitoredNetlifyFailure} from "./_monitoring.mjs";
declare const Netlify:{env:{get(key:string):string|undefined}};

// A separate bounded worker cannot delay booking notifications. The API repeats
// the full activation/configuration gates before any database/provider access.
export default async function googleProfileSync(request:Request){
 if(Netlify.env.get("GOOGLE_BUSINESS_PROFILE_ACTIVATION")!=="live")return Response.json({disabled:true});
 try{
  const secret=Netlify.env.get("INTERNAL_API_SECRET");
  if(!secret)throw Error("GOOGLE_WORKER_NOT_CONFIGURED");
  const response=await fetch("https://girlzculture.com/api/salon/integrations/google/sync",{method:"POST",redirect:"error",headers:{"x-internal-secret":secret},signal:AbortSignal.timeout(25_000)});
  if(!response.ok)throw Error("GOOGLE_WORKER_UNAVAILABLE");
  return Response.json({ok:true});
 }catch{ return monitoredNetlifyFailure({request,error:Error("GOOGLE_WORKER_UNAVAILABLE"),feature:"google-business-profile",action:"scheduled-sync",safeMessage:"Google synchronization needs review."});}
}
export const config={schedule:"7,22,37,52 * * * *"};
