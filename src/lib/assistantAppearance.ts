export const ASSISTANT_AVATARS = {
  woman: { symbol: "👩🏾", label: "Friendly woman" },
  man: { symbol: "👨🏽", label: "Friendly man" },
  woman_light: { symbol: "👩🏻", label: "Friendly woman, light skin tone" },
  man_dark: { symbol: "👨🏿", label: "Friendly man, dark skin tone" },
  cat: { symbol: "😺", label: "Smiling cat" },
  dog: { symbol: "🐶", label: "Friendly dog" },
} as const;
export type AssistantAvatar = keyof typeof ASSISTANT_AVATARS;
export function assistantAvatar(value: unknown): AssistantAvatar {
  return typeof value === "string" && Object.hasOwn(ASSISTANT_AVATARS, value) ? value as AssistantAvatar : "woman";
}
export type AssistantBusinessContext = { id: string; userId: string; avatar: AssistantAvatar; isOwner: boolean; permissions: Record<string, boolean> | null };
