export const CLIENT_PERMISSIONS = ["client_history", "client_formulas", "client_notes", "client_cautions", "client_photos", "client_spend", "client_edit"] as const;
export type ClientPermission = typeof CLIENT_PERMISSIONS[number];
export type ClientFormula = { instructions?: string; color?: string; size?: string; length?: string; technique?: string; duration_minutes?: number | null };
export type ClientLinks = { revision: number; links: { id: string; from_name: string | null; from_date: string; to_name: string | null; to_date: string }[]; candidates: { booking_id: string; name: string | null; date: string; service: string | null }[] };
export type ClientCard = {
  card_id: string | null; revision: number; booking_id: string; permissions: Record<ClientPermission, boolean>;
  scope: "this_business_only" | "assigned_stylist_only"; scope_stylist_id: string | null; source_locale: string;
  preferences: string | null; notes: string | null; cautions: string | null;
  can_link_visits?: boolean;
  related_profiles?: { card_id: string; booking_id: string; date: string; source_locale: string; preferences: string | null; notes: string | null; cautions: string | null }[];
  visits: { booking_id: string; date: string; name: string | null; status: string; duration_hours: number | null; size: string | null; length: string | null; options: unknown; formula: ClientFormula | null; formula_locale: string | null; agreed_amount: number | null }[];
  visit_count: number; capped_at: number;
  photos: { id: string; booking_id: string; caption: string; source_locale: string; created_at: string }[];
  spend: { completed_agreed_cents: number; recorded_payment_cents: number; currency: string; basis: string; period: string } | null;
};
export const clientUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const clientLocales = ["en", "fr", "es", "zh-CN"] as const;
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
export function validateClientLink(body: unknown) {
  if (!object(body) || Object.keys(body).some(key => !["request_id", "revision", "action", "target"].includes(key)) || typeof body.request_id !== "string" || !clientUuid.test(body.request_id) || typeof body.target !== "string" || !clientUuid.test(body.target) || !Number.isInteger(body.revision) || Number(body.revision) < 0 || !["link", "unlink"].includes(String(body.action))) throw Error("CLIENT_INVALID");
  return { request_id: body.request_id, revision: Number(body.revision), action: String(body.action), target: body.target };
}
export function validateClientSave(body: unknown) {
  if (!object(body) || Object.keys(body).some(key => !["request_id", "revision", "locale", "patch"].includes(key)) || typeof body.request_id !== "string" || !clientUuid.test(body.request_id) || !Number.isInteger(body.revision) || Number(body.revision) < 0 || !clientLocales.includes(body.locale as typeof clientLocales[number]) || !object(body.patch)) throw Error("CLIENT_INVALID");
  const patch = body.patch;
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !["preferences", "notes", "cautions", "formula"].includes(key))) throw Error("CLIENT_INVALID");
  for (const key of ["preferences", "notes", "cautions"]) if (key in patch && (typeof patch[key] !== "string" || patch[key].length > 4000)) throw Error("CLIENT_INVALID");
  if ("formula" in patch) {
    if (!object(patch.formula) || Object.keys(patch.formula).some(key => !["instructions", "color", "size", "length", "technique", "duration_minutes"].includes(key))) throw Error("CLIENT_INVALID");
    for (const [key, value] of Object.entries(patch.formula)) {
      if (key === "duration_minutes") { if (value !== null && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1440)) throw Error("CLIENT_INVALID"); }
      else if (typeof value !== "string" || value.length > 4000) throw Error("CLIENT_INVALID");
    }
  }
  return { request_id: body.request_id, revision: Number(body.revision), locale: String(body.locale), patch };
}
