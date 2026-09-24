import { isAssistantLanguage, type AssistantLanguage } from "@/lib/assistantLanguage";
import { AssistantError } from "@/lib/gcAssistantCore";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";

// A language preference contains no transcript or business facts. Conversation
// memory still requires its separate explicit consent.
export function assistantResponseLanguage(metadata: unknown, fallback: AssistantLanguage): AssistantLanguage {
  const value = metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>).gc_assistant_locale : undefined;
  return isAssistantLanguage(value) && value !== "wo" ? value : fallback;
}

export async function persistAssistantLanguage(
  context: Awaited<ReturnType<typeof requireSalonOwner>>,
  previous: AssistantLanguage,
  response: AssistantLanguage,
  explicitlySelected = false,
) {
  if (response === "wo" || response === previous && !explicitlySelected) return;
  if (context.user.user_metadata?.gc_assistant_locale === response) return;
  const { error } = await context.admin.auth.admin.updateUserById(context.user.id, {
    user_metadata: { gc_assistant_locale: response },
  });
  if (error) throw new AssistantError("ASSISTANT_LANGUAGE_SAVE_FAILED", 503);
}
