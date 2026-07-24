export function normalizeSalonVanitySlug(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

export function salonPublicPath(
  canonicalSlug: string,
  vanitySlug?: string | null,
) {
  return vanitySlug ? `/${vanitySlug}` : `/salon/${canonicalSlug}`;
}
