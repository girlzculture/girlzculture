const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type InstagramOnboardingProvenance = { provider: "instagram"; import_id: string; username: string; imported_at: string; media_ids: string[] };
export type InstagramOnboardingPreview = { token: string; url: string };
export function instagramOnboardingAssetId(token: unknown): string | null {
 if (typeof token !== "string" || !token.startsWith("instagram-asset:")) return null;
 const id = token.slice("instagram-asset:".length);
 return uuid.test(id) ? id : null;
}
/** Called only on a previously saved server source, never on client provenance. */
export function preservedInstagramOnboardingSource(prior: unknown, next: { kind: string; reference: string }): InstagramOnboardingProvenance | null {
 if (!prior || typeof prior !== "object" || Array.isArray(prior)) return null;
 const source = prior as Record<string, unknown>;
 if (next.kind !== "instagram" || source.kind !== next.kind || source.reference !== next.reference) return null;
 const raw = source.provider_import;
 if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
 const value = raw as Record<string, unknown>;
 if (value.provider !== "instagram" || typeof value.import_id !== "string" || !uuid.test(value.import_id) || typeof value.username !== "string" || value.username !== next.reference || !/^[a-zA-Z0-9._]{1,30}$/.test(value.username)
  || typeof value.imported_at !== "string" || !Number.isFinite(Date.parse(value.imported_at)) || !Array.isArray(value.media_ids) || value.media_ids.length > 16 || value.media_ids.some(id => typeof id !== "string" || !uuid.test(id)) || new Set(value.media_ids).size !== value.media_ids.length) return null;
 return { provider: "instagram", import_id: value.import_id, username: value.username, imported_at: value.imported_at, media_ids: value.media_ids as string[] };
}
