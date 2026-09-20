/** Every section represented by a patch must be authorized. A mixed request
 * must not inherit the permission of only its first or most privileged field. */
export function profilePatchPermissions(keys: string[]) {
  return [...new Set(keys.map(key => {
    if (key === "notification_preferences") return "settings";
    if (key === "hours" || key === "booking_settings") return "availability";
    if (["cover_photo_url", "logo_url", "gallery_photos", "media_consent", "photo_metadata"].includes(key)) return "photos";
    return "my_page";
  }))];
}

export function validateBusinessTrustInfo(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Trust information must be a valid object.");
  const entries = Object.entries(value);
  if (entries.length > 24 || entries.some(([key, flag]) => !/^[a-z_]{1,60}$/.test(key) || typeof flag !== "boolean")) throw new Error("Trust information must be a set of checkbox choices.");
  const result = Object.fromEntries(entries) as Record<string, boolean>;
  if (result.walk_ins_welcome && result.appointment_only) throw new Error("Choose either walk-ins welcome or appointment only.");
  return result;
}
