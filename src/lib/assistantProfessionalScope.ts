import {isCatalogTool} from "@/lib/assistantCatalog";
import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError, validateTool } from "@/lib/gcAssistantCore";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;

// Context comes from fresh server authentication, never a model or request field.
export function assistantAssignedProfessional(context: Context): string | null {
  return !context.isOwner && context.teamMember?.stylist_id ? String(context.teamMember.stylist_id) : null;
}

export function assistantRequestedProfessional(context: Context, requested: unknown): string | null {
  const assigned = assistantAssignedProfessional(context);
  if (assigned && requested && requested !== assigned) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  return assigned || (requested ? String(requested) : null);
}

export async function assertAssistantProposalScope(context: Context, tool: string, args: Record<string, unknown>) {
  // Recheck narrow private-field grants before replaying old proposals or prose.
  // SQL checks authorization again at confirmation, including assigned clients.
  if (tool === "prepare_client_card_change") {
    validateTool(tool, args);
    const current = await context.admin.rpc("read_business_client_card", {
      p_salon: context.salon.id, p_actor: context.user.id, p_booking: args.record_id,
    });
    if (current.error) {
      if (/CLIENT_(NOT_FOUND|ACCESS_DENIED)/.test(current.error.message)) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
      throw current.error;
    }
    const permissions = current.data?.permissions;
    const patch = (JSON.parse(String(args.changes_json)) as {patch: Record<string, unknown>}).patch;
    const fields: Record<string, string> = {preferences: "client_history", notes: "client_notes", cautions: "client_cautions", formula: "client_formulas"};
    if (!permissions?.client_history || !permissions.client_edit ||
      Object.keys(patch).some(field => !permissions[fields[field]])) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  }
  if(isCatalogTool(tool)){
    validateTool(tool,args);
    const scoped=await context.admin.rpc("preview_gc_catalog_change",{p_salon:context.salon.id,p_actor:context.user.id,p_tool:tool,p_args:args});
    if(scoped.error){if(/ASSISTANT_(ACCESS_DENIED|RECORD_NOT_FOUND)/.test(scoped.error.message))throw new AssistantError("ASSISTANT_ACCESS_DENIED",403);throw scoped.error;}
    if(scoped.data?.salon_id!==context.salon.id)throw new AssistantError("ASSISTANT_ACCESS_DENIED",403);
  }
  const assigned = assistantAssignedProfessional(context);
  if (!assigned) return;
  if (args.booking_id) {
    const record = await context.admin.from("bookings").select("id").eq("salon_id", context.salon.id).eq("id", args.booking_id).eq("stylist_id", assigned).maybeSingle();
    if (record.error) throw record.error;
    if (!record.data) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  }
  if (args.stylist_id && args.stylist_id !== assigned || tool === "prepare_availability_block" && args.stylist_id !== assigned) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
}
