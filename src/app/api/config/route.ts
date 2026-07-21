import { getPublishedEngineConfig } from "@/lib/engineConfigServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request:Request){const requested=new URL(request.url).searchParams.get("keys")?.split(",").map(value=>value.trim()).filter(value=>/^[a-z][a-z0-9_.-]{2,119}$/.test(value)).slice(0,50);const config=await getPublishedEngineConfig(requested,{publicOnly:true});let revision=1;try{const{data}=await getSupabaseAdmin().from("engine_publication_state").select("revision").eq("singleton",true).single();revision=Number(data?.revision||1)}catch{}return Response.json({revision,config},{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300","ETag":`W/\"engine-${revision}\"`}})}
