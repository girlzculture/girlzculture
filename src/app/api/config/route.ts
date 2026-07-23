import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { getPublishedEngineConfig } from "@/lib/engineConfigServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function GETHandler(request:Request){const requested=new URL(request.url).searchParams.get("keys")?.split(",").map(value=>value.trim()).filter(value=>/^[a-z][a-z0-9_.-]{2,119}$/.test(value)).slice(0,50);const config=await getPublishedEngineConfig(requested,{publicOnly:true});let revision=1;try{const{data,error}=await getSupabaseAdmin().from("engine_publication_state").select("revision").eq("singleton",true).single();if(error)throw error;revision=Number(data?.revision||1)}catch(error){noteOperationalFailure("Published configuration revision lookup failed",error)}return Response.json({revision,config},{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300","ETag":`W/\"engine-${revision}\"`}})}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/config", "GET"), GETHandler);
