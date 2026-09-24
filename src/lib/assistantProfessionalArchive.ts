import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";

/** The database owns the preview as well as confirmation authorization. */
export async function prepareProfessionalArchive(
  context: Awaited<ReturnType<typeof requireSalonOwner>>,
  args: Record<string, unknown>,
) {
  if (!context.isOwner) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  const result = await context.admin.rpc("preview_gc_professional_archive", {
    p_salon: context.salon.id, p_actor: context.user.id, p_professional: args.stylist_id,
  });
  if (result.error) {
    const code = /ASSISTANT_[A-Z_]+/.exec(result.error.message)?.[0] || "ASSISTANT_UNAVAILABLE";
    throw new AssistantError(code, code.includes("ACCESS") ? 403 : 409);
  }
  if (!result.data?.before || !result.data?.payload) throw new AssistantError("ASSISTANT_UNAVAILABLE", 503);
  return { ...result.data, notices: [] };
}
