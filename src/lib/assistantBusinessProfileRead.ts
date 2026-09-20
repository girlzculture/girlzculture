import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";
import { assistantAvatar, ASSISTANT_AVATARS } from "@/lib/assistantAppearance";
import { isAssistantLanguage } from "@/lib/assistantLanguage";
import { isRegisteredTestBusiness } from "@/lib/marketplaceEligibilityServer";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
const object = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const text = (value: unknown, cap = 200) => typeof value === "string" ? value.slice(0, cap) : null;
const flag = (value: unknown) => typeof value === "boolean" ? value : null;
const unavailable = () => new AssistantError("ASSISTANT_PROFILE_UNAVAILABLE", 503);
const denied = () => new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
function contact(value: unknown, kind: "phone" | "email") {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || (kind === "email" ? value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : value.length > 40 || !/^[+()\d.\s-]+$/.test(value) || !/^[\d]{7,15}$/.test(value.replace(/\D/g, "")))) throw unavailable();
  return value;
}
const fields = "id,user_id,name,description,phone,email,address_street,address_line2,address_city,address_state,address_zip,languages,hours,instagram_url,tiktok_url,google_business_url,slug,vanity_slug,time_zone,trust_info,is_discoverable,accepting_bookings,owner_unpublished_at,status";
// A persisted marker or copied result cannot opt out of PII redaction. Only a
// fresh result object that passed this reader's checks carries these scalars.
const contacts = new WeakMap<object, { business: string; actor: string; phone: string | null; email: string | null }>();

async function permission(context: Context, name: "my_page" | "settings") {
  const read = await context.admin.rpc("p0_actor_has_permission", { p_salon: context.salon.id, p_user: context.user.id, p_permission: name });
  if (read.error) throw unavailable();
  if (read.data !== true) throw denied();
}

async function binding(context: Context, salon: Row) {
  if (salon.id !== context.salon.id || typeof salon.user_id !== "string") throw unavailable();
  if (context.isOwner) { if (salon.user_id !== context.user.id) throw denied(); return; }
  const read = await context.admin.from("salon_team_members").select("id,salon_id,user_id,status").eq("salon_id", context.salon.id).eq("user_id", context.user.id).eq("status", "Active").maybeSingle();
  const member = object(read.data);
  if (read.error) throw unavailable();
  if (!member || member.id !== context.teamMember?.id || member.salon_id !== context.salon.id || member.user_id !== context.user.id || member.status !== "Active") throw denied();
}

async function ownSalon(context: Context, selected: string) {
  const read = await context.admin.from("salons").select(selected).eq("id", context.salon.id).maybeSingle();
  if (read.error) throw unavailable();
  const salon = object(read.data);
  if (!salon) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
  await binding(context, salon);
  return salon;
}

async function finish(context: Context, name: "my_page" | "settings") {
  await ownSalon(context, "id,user_id");
  await permission(context, name);
}

export async function readAssistantBusinessProfile(context: Context) {
  await permission(context, "my_page");
  const salon = await ownSalon(context, fields);
  const [visible, registered] = await Promise.all([
    context.admin.rpc("is_salon_profile_public", { target_salon_id: context.salon.id }),
    isRegisteredTestBusiness(context.admin, context.salon.id).catch(() => null),
  ]);
  await finish(context, "my_page");
  const trust = object(salon.trust_info);
  const languages = Array.isArray(salon.languages) && salon.languages.every(value => typeof value === "string") ? salon.languages : null;
  const result = {
    ...Object.fromEntries(["name", "description", "address_street", "address_line2", "address_city", "address_state", "address_zip", "instagram_url", "tiktok_url", "google_business_url", "slug", "vanity_slug", "time_zone"].map(key => [key, text(salon[key], key === "description" ? 12000 : 500)])),
    phone: contact(salon.phone, "phone"), email: contact(salon.email, "email"),
    languages: languages?.slice(0, 5) ?? null, language_count: languages?.length ?? null,
    shown_language_count: languages ? Math.min(languages.length, 5) : null, languages_are_excerpt: languages ? languages.length > 5 : null,
    hours: object(salon.hours), walk_ins_welcome: flag(trust?.walk_ins_welcome), appointment_only: flag(trust?.appointment_only),
    publication: {
      profile_public: !visible.error && typeof visible.data === "boolean" && registered !== null ? visible.data && !registered : null,
      discoverable: flag(salon.is_discoverable), accepting_bookings: flag(salon.accepting_bookings),
      owner_unpublished_at: text(salon.owner_unpublished_at, 40), recorded_status: text(salon.status, 50),
    },
    as_of: new Date().toISOString(), href: "/salon/dashboard/my-page",
    evidence: "Current saved business profile. Profile visibility, discovery and accepting bookings are separate states. Null is unavailable or unset, not false. These contact fields belong to this business, not a customer or login account. Unsaved editor text and user-wide AI drafts are not read; use the separate authorized media and policy tools for their records.",
  };
  contacts.set(result, { business: context.salon.id, actor: context.user.id, phone: result.phone, email: result.email });
  return result;
}

/** Apply after ordinary bounded/redacted projection; never restore prose,
 * customer records, persisted copies, arbitrary tool results or foreign scope. */
export function restoreAuthorizedBusinessContact(result: unknown, redacted: unknown, context: Context): unknown {
  const row = object(result), safe = object(redacted);
  const authorized = row ? contacts.get(row) : null;
  if (!safe || !authorized || authorized.business !== context.salon.id || authorized.actor !== context.user.id) return redacted;
  return { ...safe, phone: authorized.phone, email: authorized.email };
}

export async function readAssistantBusinessSettings(context: Context) {
  await permission(context, "settings");
  const salon = await ownSalon(context, "id,user_id,notification_preferences,gc_assistant_avatar");
  // Locale is data, never authorization. No arbitrary user ID or metadata
  // object is projected; an updated own account preference is read on demand.
  const auth = await context.admin.auth.admin.getUserById(context.user.id);
  if (auth.error || !auth.data.user || auth.data.user.id !== context.user.id) throw unavailable();
  await finish(context, "settings");
  const preferences = object(salon.notification_preferences);
  const savedAvatar = typeof salon.gc_assistant_avatar === "string" && Object.hasOwn(ASSISTANT_AVATARS, salon.gc_assistant_avatar) ? salon.gc_assistant_avatar : null;
  return {
    saved_ui_locale: isAssistantLanguage(auth.data.user.user_metadata?.locale) ? auth.data.user.user_metadata.locale : null,
    notification_preferences: { reviews: flag(preferences?.reviews), marketing: flag(preferences?.marketing) },
    required_booking_alerts: { in_app: true, email: true, sms: true },
    appearance: { avatar: assistantAvatar(salon.gc_assistant_avatar), saved_avatar: savedAvatar, uses_default: savedAvatar === null, can_change: context.isOwner },
    available_actions: [
      { action: "notification_preferences", href: "/salon/dashboard/settings/notifications" },
      { action: "own_interface_language", href: "/salon/dashboard/settings", control: "header_language_selector" },
      ...(context.isOwner ? [{ action: "assistant_appearance", href: "/salon/dashboard/settings/account" }] : []),
    ],
    as_of: new Date().toISOString(),
    evidence: "Current own-account interface locale and authorized business settings, not authentication data. A response-language request does not establish the saved interface locale. Optional notification null means no saved choice; the Settings interface defaults these choices on. Required booking alert channels cannot be disabled in Settings; channel configuration is not proof of delivery. Avatar defaults are explicit; only the current owner can change appearance. These are navigation actions, not completed changes. No password, security, customer or other-business data is read.",
  };
}
