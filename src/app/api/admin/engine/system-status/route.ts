import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { errorResponse } from "@/lib/requestSecurity";
import { aiProviderConfigured, approvedAiProviders } from "@/lib/aiAutomationServer";

const EXPECTED_MIGRATION = "20260721100000";
type State = "healthy" | "configuration_required" | "migration_required" | "optional";
type Status = { key:string;label:string;state:State;detail:string;required:boolean };

async function GETHandler(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "settings");
    const statuses: Status[] = [];
    const { data: engine, error: engineError } = await admin.from("engine_settings").select("published_value").eq("setting_key", "integrations.expected_migration").maybeSingle();
    const declaredMigration = String(engine?.published_value || "").replaceAll('"', "");
    statuses.push({ key:"migrations", label:"Database migrations", state:engineError||declaredMigration!==EXPECTED_MIGRATION?"migration_required":"healthy", detail:engineError?"The Engine expansion migration has not been applied to this database.":declaredMigration===EXPECTED_MIGRATION?`Repository schema ${EXPECTED_MIGRATION} is declared by the connected database.`:`Connected database reports ${declaredMigration||"no Engine release"}; repository expects ${EXPECTED_MIGRATION}.`, required:true });
    statuses.push({ key:"supabase",label:"Supabase database and authentication",state:"healthy",detail:"The authenticated server connection is responding.",required:true });
    const { data: buckets, error: storageError } = await admin.storage.listBuckets();
    statuses.push({ key:"storage",label:"Media storage",state:storageError?"configuration_required":"healthy",detail:storageError?"Storage could not be verified with the current server configuration.":`${buckets?.length||0} storage bucket(s) are available to the server.`,required:true });
    const stripeConfigured=Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET);
    statuses.push({ key:"stripe",label:"Stripe payments",state:stripeConfigured?"healthy":"configuration_required",detail:stripeConfigured?"Server-side payment and webhook credentials are configured.":"Add the server-side Stripe test credentials before payment testing.",required:true });
    const mapsConfigured=Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY||process.env.GOOGLE_MAPS_API_KEY);
    statuses.push({ key:"maps",label:"Maps and geocoding",state:mapsConfigured?"healthy":"optional",detail:mapsConfigured?"A maps provider key is configured.":"Maps are optional; location search retains structured database behavior.",required:false });
    const emailConfigured=Boolean(process.env.RESEND_API_KEY);
    statuses.push({ key:"email",label:"Transactional email",state:emailConfigured?"healthy":"configuration_required",detail:emailConfigured?"The server-side email provider is configured.":"Email delivery requires a server-side provider key.",required:true });
    const smsConfigured=Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_PHONE_NUMBER);
    statuses.push({ key:"sms",label:"Transactional SMS",state:smsConfigured?"healthy":"optional",detail:smsConfigured?"The server-side SMS provider is configured.":"SMS is optional; email and in-app notification paths remain available.",required:false });
    const pushConfigured=Boolean(process.env.VAPID_PRIVATE_KEY&&process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    statuses.push({ key:"push",label:"Web push",state:pushConfigured?"healthy":"optional",detail:pushConfigured?"Private and public web-push keys are configured.":"Web push is optional and currently unavailable.",required:false });
    const { count:localeCount,error:localeError }=await admin.from("supported_locales").select("locale",{count:"exact",head:true}).eq("is_enabled",true);
    statuses.push({ key:"translation",label:"Language registry",state:localeError?"migration_required":"healthy",detail:localeError?"The dynamic language registry could not be read.":`${localeCount||0} language(s) are enabled; English remains the fallback.`,required:true });
    const configuredProviders=approvedAiProviders().filter(provider=>provider!=="test"&&aiProviderConfigured(provider));
    statuses.push({ key:"ai",label:"AI provider",state:configuredProviders.length?"healthy":"optional",detail:configuredProviders.length?`${configuredProviders.length} approved external provider(s) are configured server-side.`:"No external AI provider is configured. Deterministic core behavior remains active.",required:false });
    statuses.push({ key:"deployment",label:"Migration deployment workflow",state:process.env.GITHUB_ACTIONS||process.env.NETLIFY?"healthy":"optional",detail:process.env.GITHUB_ACTIONS?"This status check is running in the repository CI environment.":process.env.NETLIFY?"This status check is running in Netlify.":"Local environment detected; CI workflow configuration is verified separately.",required:true });
    return Response.json({ expectedMigration:EXPECTED_MIGRATION, checkedAt:new Date().toISOString(), statuses });
  } catch (error) {
    noteOperationalFailure("Engine system status failed", error);
    return errorResponse(error, "Unable to check connected platform systems.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/system-status", "GET"), GETHandler);
