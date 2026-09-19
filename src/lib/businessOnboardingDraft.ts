import { POLICY_DEFAULTS, validateBusinessPolicy, type BusinessPolicy } from "@/lib/businessPolicyCore";
import { normalizeUsState, normalizeUsZip } from "@/lib/usStates";
import { cleanUsPhone } from "@/lib/requestSecurity";

export const ONBOARDING_SECTIONS = ["identity", "services", "hours", "photos", "team", "policies"] as const;
export const ONBOARDING_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type OnboardingSection = typeof ONBOARDING_SECTIONS[number];
export type OnboardingService = { name: string; price: number | null; minutes: number | null; group_id: string | null };
export type OnboardingFacts = {
  identity: { name: string; description: string; phone: string; address_street: string; address_city: string; address_state: string; address_zip: string };
  services: OnboardingService[];
  hours: Partial<Record<typeof ONBOARDING_DAYS[number], { closed: boolean; open?: string; close?: string }>>;
  photos: string[];
  team: { name: string; bio: string }[];
  policies: BusinessPolicy | null;
};
export type OnboardingSource = { kind: "manual" | "instagram" | "website"; reference: string; permitted: true; text?: string };
export type OnboardingDraft = { id: string; revision: number; status: "draft" | "applied"; source: OnboardingSource & { locale?: string; extraction?: { method: string; evidence: { field: string; quote?: string; excerpt?: string }[]; unresolved: (string | number)[]; owner_review_edited?: boolean } }; facts: OnboardingFacts; uncertain: string[]; result: Record<string, unknown> | null; created_at: string };
export class OnboardingInputError extends Error {
  constructor(public code: string) { super(code); }
}
const invalid = (): never => { throw new OnboardingInputError("ONBOARDING_INVALID"); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  return input as Record<string, unknown>;
}
function exact(input: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(input).some(key => !keys.includes(key))) invalid();
}
function text(input: unknown, limit: number) {
  if (input == null) return "";
  if (typeof input !== "string" || input.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input)) return invalid();
  return input.trim();
}
function rows(input: unknown, limit: number) {
  if (!Array.isArray(input) || input.length > limit) return invalid();
  return input;
}
function number(input: unknown, max: number, integer = false) {
  if (input == null || input === "") return null;
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > max || integer && !Number.isInteger(input)) return invalid();
  return input;
}
export function onboardingOwnedPhotos(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => {
    if (typeof value !== "string" || value.length > 1200) return false;
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  });
}
export function onboardingSource(input: unknown): OnboardingSource {
  const source = record(input); exact(source, ["kind", "reference", "permitted", "text"]);
  if (!["manual", "instagram", "website"].includes(String(source.kind)) || source.permitted !== true) return invalid();
  let reference = text(source.reference, 500);
  if (source.kind === "instagram") {
    reference = reference.replace(/^@/, "");
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(reference)) return invalid();
  } else if (source.kind === "website") {
    try { const url = new URL(reference); if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return invalid(); reference = url.toString(); }
    catch { return invalid(); }
  }
  // References are provenance only. This path never fetches or scrapes them.
  return { kind: source.kind as OnboardingSource["kind"], reference, permitted: true, ...(source.text ? { text: text(source.text, 12000) } : {}) };
}
export function onboardingFacts(input: unknown, ownedPhotos: readonly string[]): OnboardingFacts {
  const facts = record(input); exact(facts, ONBOARDING_SECTIONS);
  const identity = record(facts.identity);
  const identityKeys = ["name", "description", "phone", "address_street", "address_city", "address_state", "address_zip"] as const;
  exact(identity, identityKeys);
  const clean = Object.fromEntries(identityKeys.map(key => [key, text(identity[key], key === "description" ? 2000 : 240)])) as OnboardingFacts["identity"];
  if (clean.description.split(/\s+/u).filter(Boolean).length > 200) invalid();
  if (clean.phone) { try { clean.phone = cleanUsPhone(clean.phone); } catch { invalid(); } }
  if (clean.address_state) { try { clean.address_state = normalizeUsState(clean.address_state); } catch { invalid(); } }
  if (clean.address_zip) { try { clean.address_zip = normalizeUsZip(clean.address_zip); } catch { invalid(); } }
  const services = rows(facts.services, 50).map(raw => {
    const row = record(raw); exact(row, ["name", "price", "minutes", "group_id"]);
    const name = text(row.name, 120); if (!name) return invalid();
    const price = number(row.price, 100000), minutes = number(row.minutes, 1440, true);
    if (minutes === 0 || price !== null && Math.round(price * 100) !== price * 100 && Math.abs(Math.round(price * 100) - price * 100) > 0.000001) return invalid();
    const group = text(row.group_id, 36); if (group && !uuid.test(group)) return invalid();
    return { name, price, minutes, group_id: group || null };
  });
  if (new Set(services.map(row => row.name.toLocaleLowerCase())).size !== services.length) throw new OnboardingInputError("ONBOARDING_DUPLICATE_SERVICE");
  const hours = record(facts.hours); exact(hours, ONBOARDING_DAYS);
  const cleanedHours: OnboardingFacts["hours"] = {};
  for (const day of ONBOARDING_DAYS) {
    if (!Object.hasOwn(hours, day)) continue;
    const slot = record(hours[day]); exact(slot, ["closed", "open", "close"]);
    if (typeof slot.closed !== "boolean") return invalid();
    if (slot.closed) cleanedHours[day] = { closed: true };
    else {
      const open = text(slot.open, 5), close = text(slot.close, 5);
      if (![open, close].every(value => /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(value)) || open >= close) return invalid();
      cleanedHours[day] = { closed: false, open, close };
    }
  }
  const photos = rows(facts.photos, 16).map(value => {
    const photo = text(value, 1200);
    if (!photo || !onboardingOwnedPhotos(ownedPhotos).includes(photo)) throw new OnboardingInputError("ONBOARDING_PHOTO_NOT_OWNED");
    return photo;
  });
  const team = rows(facts.team, 30).map(raw => {
    const row = record(raw); exact(row, ["name", "bio"]);
    const name = text(row.name, 120); if (!name) return invalid();
    return { name, bio: text(row.bio, 500) };
  });
  if (new Set(team.map(row => row.name.toLocaleLowerCase())).size !== team.length) throw new OnboardingInputError("ONBOARDING_DUPLICATE_TEAM");
  let policies: BusinessPolicy | null = null;
  if (facts.policies !== null) { try { policies = validateBusinessPolicy(facts.policies); } catch { return invalid(); } }
  return { identity: clean, services, hours: cleanedHours, photos: [...new Set(photos)], team, policies };
}
export function onboardingUncertainty(facts: OnboardingFacts) {
  const missing = Object.entries(facts.identity).filter(([, value]) => !value).map(([key]) => `identity.${key}`);
  if (!facts.services.length) missing.push("services");
  facts.services.forEach((row, index) => { for (const key of ["price", "minutes", "group_id"] as const) if (row[key] === null) missing.push(`services.${index}.${key}`); });
  for (const day of ONBOARDING_DAYS) if (!facts.hours[day]) missing.push(`hours.${day}`);
  if (!facts.photos.length) missing.push("photos");
  if (!facts.team.length) missing.push("team");
  if (!facts.policies) missing.push("policies");
  return missing;
}
export function onboardingConfirmation(input: unknown) {
  const body = record(input); exact(body, ["action", "id", "revision", "reviewed", "confirm", "keep_unpublished", "public_impact"]);
  if (body.action !== "confirm" || typeof body.id !== "string" || !uuid.test(body.id) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1 || body.confirm !== true || typeof body.keep_unpublished !== "boolean" || typeof body.public_impact !== "boolean" || body.keep_unpublished === body.public_impact) return invalid();
  const reviewed = rows(body.reviewed, 6);
  if (reviewed.length !== 6 || ONBOARDING_SECTIONS.some(section => !reviewed.includes(section))) throw new OnboardingInputError("ONBOARDING_REVIEW_REQUIRED");
  return { id: body.id, revision: Number(body.revision), keepUnpublished: body.keep_unpublished, publicImpact: body.public_impact };
}
export function emptyOnboardingFacts(): OnboardingFacts {
  return { identity: { name: "", description: "", phone: "", address_street: "", address_city: "", address_state: "", address_zip: "" }, services: [], hours: {}, photos: [], team: [], policies: null };
}
export function onboardingPolicyTemplate(): BusinessPolicy { return { ...POLICY_DEFAULTS, business_policy_text: "" }; }
