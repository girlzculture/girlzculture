import { emptyOnboardingFacts, onboardingFacts, type OnboardingFacts } from "@/lib/businessOnboardingDraft";

export class OnboardingAiError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: "string" }, optionalString = { type: ["string", "null"] };
export const onboardingAiSchema = object({
  identity: { type: "array", items: object({ field: { type: "string", enum: ["name", "description", "address_street", "address_city", "address_state", "address_zip"] }, value: string, quote: string }) },
  services: { type: "array", items: object({ name: string, price_text: optionalString, duration_text: optionalString, quote: string }) },
  hours: { type: "array", items: object({ day_text: string, open: optionalString, close: optionalString, closed_text: optionalString, quote: string }) },
  team: { type: "array", items: object({ name: string, bio: optionalString, quote: string }) },
  unresolved: { type: "array", items: string },
});
const days: Record<string, keyof OnboardingFacts["hours"]> = {
  mon:"Mon",monday:"Mon",lundi:"Mon",lunes:"Mon",星期一:"Mon",tue:"Tue",tuesday:"Tue",mardi:"Tue",martes:"Tue",星期二:"Tue",wed:"Wed",wednesday:"Wed",mercredi:"Wed",miércoles:"Wed",星期三:"Wed",thu:"Thu",thursday:"Thu",jeudi:"Thu",jueves:"Thu",星期四:"Thu",fri:"Fri",friday:"Fri",vendredi:"Fri",viernes:"Fri",星期五:"Fri",sat:"Sat",saturday:"Sat",samedi:"Sat",sábado:"Sat",星期六:"Sat",sun:"Sun",sunday:"Sun",dimanche:"Sun",domingo:"Sun",星期日:"Sun",
};
const fail = (): never => { throw new OnboardingAiError("ONBOARDING_AI_UNGROUNDED", 502); };
function row(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key)) || Object.keys(result).some(key => !keys.includes(key))) return fail();
  return result;
}
function array(value: unknown, max: number) { if (!Array.isArray(value) || value.length > max) return fail(); return value; }
function completeLiteral(value: string, quote: string) {
  const word = /[\p{Script=Latin}\p{N}]/u;
  for (let at = quote.indexOf(value); at >= 0; at = quote.indexOf(value, at + 1)) {
    const before = quote[at - 1] || "", after = quote[at + value.length] || "";
    if (!(word.test(value[0]) && word.test(before)) && !(word.test(value[value.length - 1]) && word.test(after))) return true;
  }
  return false;
}
function literal(value: unknown, quote: string, max = 240) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || value.includes("[REDACTED]") || !completeLiteral(value, quote)) return fail();
  return value;
}
/** Only literal evidence from this owner's submitted text can become a field.
 * The model never supplies IDs, URLs, policies, permissions or publication state. */
export function parseOnboardingAi(text: string, source: string) {
  if (text.length > 32000) return fail();
  let decoded: unknown; try { decoded = JSON.parse(text); } catch { return fail(); }
  const root = row(decoded, ["identity", "services", "hours", "team", "unresolved"]);
  const facts = emptyOnboardingFacts(), evidence: { field: string; quote: string }[] = [];
  const seen = new Set<string>();
  function quote(value: unknown) { return literal(value, source, 800); }
  for (const raw of array(root.identity, 6)) {
    const item = row(raw, ["field", "value", "quote"]), excerpt = quote(item.quote);
    if (typeof item.field !== "string" || !["name", "description", "address_street", "address_city", "address_state", "address_zip"].includes(item.field) || seen.has(`identity.${item.field}`)) return fail();
    facts.identity[item.field as keyof OnboardingFacts["identity"]] = literal(item.value, excerpt, item.field === "description" ? 800 : 240);
    seen.add(`identity.${item.field}`); evidence.push({ field: `identity.${item.field}`, quote: excerpt });
  }
  for (const raw of array(root.services, 12)) {
    const item = row(raw, ["name", "price_text", "duration_text", "quote"]), excerpt = quote(item.quote), name = literal(item.name, excerpt, 120);
    let price: number | null = null, minutes: number | null = null;
    if (item.price_text !== null) {
      const priceText = literal(item.price_text, excerpt, 30), match = priceText.match(/^(?:USD\s*|\$)(\d{1,6}(?:\.\d{1,2})?)$/iu);
      if (!match) return fail(); price = Number(match[1]);
      // A fragment of a range/from-price is not an exact bookable price.
      const at = excerpt.indexOf(priceText), before = excerpt.slice(Math.max(0, at - 24), at), after = excerpt.slice(at + priceText.length, at + priceText.length + 20);
      if (/(?:from|starting at|à partir de|a partir de|desde|起)\s*$/iu.test(before) || /\d\s*[-–—]\s*$/u.test(before) || /^\s*(?:[-–—]\s*(?:\$|USD|\d)|\+|起)/iu.test(after)) price = null;
    }
    if (item.duration_text !== null) {
      const durationText = literal(item.duration_text, excerpt, 40), duration = durationText.match(/^(\d{1,4}(?:\.\d{1,2})?)\s*(min(?:utes)?|minutos|分钟|h(?:ours?)?|heures?|horas?|小时)$/iu);
      if (!duration) return fail(); minutes = Number(duration[1]) * (/^(h|heure|hora|小时)/iu.test(duration[2]) ? 60 : 1);
      const at = excerpt.indexOf(durationText), before = excerpt.slice(Math.max(0, at - 20), at), after = excerpt.slice(at + durationText.length, at + durationText.length + 20);
      if (/\d\s*[-–—]\s*$/u.test(before) || /^\s*(?:[-–—]\s*\d|\+)/u.test(after)) minutes = null;
    }
    evidence.push({ field: `services.${facts.services.length}`, quote: excerpt }); facts.services.push({ name, price, minutes, group_id: null });
  }
  for (const raw of array(root.hours, 7)) {
    const item = row(raw, ["day_text", "open", "close", "closed_text", "quote"]), excerpt = quote(item.quote);
    const day = days[literal(item.day_text, excerpt, 20).toLocaleLowerCase()];
    if (!day || facts.hours[day]) return fail();
    if (item.closed_text !== null) {
      if (!/^(closed|fermé|cerrado|休息)$/iu.test(literal(item.closed_text, excerpt, 20)) || item.open !== null || item.close !== null) return fail();
      facts.hours[day] = { closed: true };
    } else facts.hours[day] = { closed: false, open: literal(item.open, excerpt, 5), close: literal(item.close, excerpt, 5) };
    evidence.push({ field: `hours.${day}`, quote: excerpt });
  }
  for (const raw of array(root.team, 8)) {
    const item = row(raw, ["name", "bio", "quote"]), excerpt = quote(item.quote);
    facts.team.push({ name: literal(item.name, excerpt, 120), bio: item.bio === null ? "" : literal(item.bio, excerpt, 500) });
    evidence.push({ field: `team.${facts.team.length - 1}`, quote: excerpt });
  }
  const unresolved = array(root.unresolved, 20).map(value => quote(value));
  try { return { facts: onboardingFacts(facts, []), evidence, unresolved }; } catch { return fail(); }
}
