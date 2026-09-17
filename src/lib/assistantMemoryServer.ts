import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AssistantError } from "@/lib/gcAssistantCore";
import { selectMemoryContext, validateMemoryInput } from "@/lib/assistantMemoryCore";
import { MEMORY_RETENTION_DAYS } from "@/lib/assistantMemory";

type Context = { admin: SupabaseClient; user: { id: string }; salon: { id: string } };
const columns = "request_ids,locale,saved_at,expires_at";
async function authorizedReferences(context: Context, requestIds: string[]) {
  const {admin, user, salon} = context;
  const plan = await admin.rpc("p0_business_plan_active", {p_salon:salon.id});
  if (plan.error) throw plan.error;
  if (plan.data !== true) throw new AssistantError("ASSISTANT_PLAN_REQUIRED", 403);
  if (!requestIds.length) return [];
  const requests = await admin.from("gc_assistant_requests").select("id,tool,permission,risk_class,failure_code")
    .eq("salon_id",salon.id).eq("requested_by",user.id).in("id",requestIds).limit(6);
  if (requests.error) throw requests.error;
  const permissions = new Set<string>();
  for (const permission of new Set<string>((requests.data || []).map(row => row.permission))) {
    const access = await admin.rpc("p0_actor_has_permission", {p_salon:salon.id,p_user:user.id,p_permission:permission});
    if (access.error) throw access.error;
    if (access.data === true) permissions.add(permission);
  }
  return selectMemoryContext(requests.data || [], requestIds, permissions);
}

export async function readAssistantMemory(context: Context) {
  const result = await context.admin.from("gc_assistant_memory").select(columns)
    .eq("salon_id",context.salon.id).eq("requested_by",context.user.id)
    .gt("expires_at",new Date().toISOString()).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const ids = await authorizedReferences(context,result.data.request_ids);
  return {...result.data,request_ids:ids};
}

export async function saveAssistantMemory(context: Context, raw: unknown) {
  const input = validateMemoryInput(raw);
  const ids = await authorizedReferences(context,input.request_ids);
  if (!ids.length) throw new AssistantError("ASSISTANT_MEMORY_NO_SAFE_CONTEXT");
  const now = new Date();
  const result = await context.admin.from("gc_assistant_memory").upsert({
    salon_id:context.salon.id, requested_by:context.user.id, request_ids:ids, locale:input.locale,
    saved_at:now.toISOString(), expires_at:new Date(now.getTime()+MEMORY_RETENTION_DAYS*86400000).toISOString(),
  },{onConflict:"salon_id,requested_by"}).select(columns).single();
  if (result.error) throw result.error;
  return result.data;
}

export async function deleteAssistantMemory(context: Context) {
  // Deleting an opt-in bookmark must remain possible after a plan expires.
  const result = await context.admin.from("gc_assistant_memory").delete()
    .eq("salon_id",context.salon.id).eq("requested_by",context.user.id);
  if (result.error) throw result.error;
}
