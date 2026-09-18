import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";

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
  const assigned = assistantAssignedProfessional(context);
  if (!assigned) return;
  if (args.booking_id) {
    const record = await context.admin.from("bookings").select("id").eq("salon_id", context.salon.id).eq("id", args.booking_id).eq("stylist_id", assigned).maybeSingle();
    if (record.error) throw record.error;
    if (!record.data) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  }
  if (args.stylist_id && args.stylist_id !== assigned || tool === "prepare_availability_block" && args.stylist_id !== assigned) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
}
