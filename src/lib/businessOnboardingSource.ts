import { emptyOnboardingFacts, type OnboardingFacts } from "@/lib/businessOnboardingDraft";

/** Explicit owner-provided text only. Never fetch a URL, run embedded markup,
 * infer facts from a handle, or treat source instructions as executable code. */
export function structureOwnerSource(text: string, existing = emptyOnboardingFacts()) {
  if (typeof text !== "string" || text.length > 12000) throw new Error("ONBOARDING_SOURCE_TOO_LONG");
  const facts: OnboardingFacts = structuredClone(existing);
  const evidence: { field: string; line: number; excerpt: string }[] = [];
  const unresolved: number[] = [];
  const identity: Record<string, keyof OnboardingFacts["identity"]> = {
    "business name": "name", "nom de l’entreprise": "name", "nom de l'entreprise": "name", "nombre del negocio": "name", "商家名称": "name",
    "description": "description", "descripción": "description", "简介": "description",
    "phone": "phone", "téléphone": "phone", "teléfono": "phone", "电话": "phone",
    "street address": "address_street", "adresse": "address_street", "dirección": "address_street", "街道地址": "address_street",
    "city": "address_city", "ville": "address_city", "ciudad": "address_city", "城市": "address_city",
    "state": "address_state", "état": "address_state", "estado": "address_state", "州": "address_state",
    "zip": "address_zip", "zip code": "address_zip", "code postal": "address_zip", "código postal": "address_zip", "邮编": "address_zip",
  };
  const days = { mon: "Mon", monday: "Mon", lundi: "Mon", lunes: "Mon", "星期一": "Mon", tue: "Tue", tuesday: "Tue", mardi: "Tue", martes: "Tue", "星期二": "Tue", wed: "Wed", wednesday: "Wed", mercredi: "Wed", miércoles: "Wed", "星期三": "Wed", thu: "Thu", thursday: "Thu", jeudi: "Thu", jueves: "Thu", "星期四": "Thu", fri: "Fri", friday: "Fri", vendredi: "Fri", viernes: "Fri", "星期五": "Fri", sat: "Sat", saturday: "Sat", samedi: "Sat", sábado: "Sat", "星期六": "Sat", sun: "Sun", sunday: "Sun", dimanche: "Sun", domingo: "Sun", "星期日": "Sun" } as const;
  const seen = new Set<string>();
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*([^:：]{1,50})[:：]\s*(.+?)\s*$/u);
    if (!match) { unresolved.push(index + 1); continue; }
    const label = match[1].trim().toLocaleLowerCase(), value = match[2];
    const key = identity[label];
    if (key && !seen.has(`identity.${key}`)) {
      facts.identity[key] = value; seen.add(`identity.${key}`); evidence.push({ field: `identity.${key}`, line: index + 1, excerpt: line }); continue;
    }
    const day = days[label as keyof typeof days];
    if (day && !seen.has(`hours.${day}`)) {
      if (/^(closed|fermé|cerrado|休息)$/iu.test(value)) facts.hours[day] = { closed: true };
      else {
        const hours = value.match(/^(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})$/u);
        if (!hours || hours[1] >= hours[2] || ![hours[1], hours[2]].every(time => /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(time))) { unresolved.push(index + 1); continue; }
        facts.hours[day] = { closed: false, open: hours[1], close: hours[2] };
      }
      seen.add(`hours.${day}`); evidence.push({ field: `hours.${day}`, line: index + 1, excerpt: line }); continue;
    }
    if (/^(service|prestation|servicio|服务)$/u.test(label)) {
      // No inferred currency or duration unit: require the supplied USD amount
      // and minutes. Catalog classification is intentionally left unresolved.
      const service = value.match(/^([^|]{1,120})\s*\|\s*(?:USD\s*|\$)(\d{1,6}(?:\.\d{1,2})?)\s*\|\s*(\d{1,4})\s*(?:min|minutes|minutos|分钟)$/iu);
      if (!service || Number(service[2]) > 100000 || Number(service[3]) < 1 || Number(service[3]) > 1440) { unresolved.push(index + 1); continue; }
      const name = service[1].trim();
      if (facts.services.some(row => row.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { unresolved.push(index + 1); continue; }
      facts.services.push({ name, price: Number(service[2]), minutes: Number(service[3]), group_id: null });
      evidence.push({ field: `services.${facts.services.length - 1}`, line: index + 1, excerpt: line }); continue;
    }
    if (/^(team member|membre de l’équipe|membre de l'équipe|miembro del equipo|团队成员)$/u.test(label)) {
      const [name, ...bio] = value.split("|").map(part => part.trim());
      if (!name || name.length > 120 || facts.team.some(row => row.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { unresolved.push(index + 1); continue; }
      facts.team.push({ name, bio: bio.join(" | ") }); evidence.push({ field: `team.${facts.team.length - 1}`, line: index + 1, excerpt: line }); continue;
    }
    unresolved.push(index + 1);
  }
  return { facts, evidence, unresolved };
}
