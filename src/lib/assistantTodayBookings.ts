import { dateKeyInTimeZone, salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";

/** Complete own-business day questions only. Remaining/upcoming appointments,
 * status filters, writes, quotations and other businesses stay with the planner.
 * The day and time zone come from the server, never from model date arguments. */
export function ownTodayBookingRange(text: string, requestedTimeZone: unknown, now = new Date()) {
  const question = text.normalize("NFKC").trim().replaceAll("’", "'");
  const matches = [
    /^(?:do i have (?:any )?(?:bookings|appointments) today|(?:how many|what|which) (?:bookings|appointments) do i have today|(?:show|list) (?:all )?my (?:bookings|appointments) (?:for )?today)\s*[?.!]?$/iu,
    /^(?:ai-je des rendez-vous aujourd'hui|(?:combien de rendez-vous ai-je|quels sont mes rendez-vous) aujourd'hui|(?:montre|affiche) (?:tous )?mes rendez-vous (?:d')?aujourd'hui)\s*[?.!]?$/iu,
    /^¿?(?:tengo (?:citas|reservas) hoy|(?:cuántas|qué) (?:citas|reservas) tengo hoy|(?:muestra|lista) (?:todas )?mis (?:citas|reservas) (?:de )?hoy)\s*[?!.]?$/iu,
    /^(?:我今天有预约吗|我今天有(?:多少|哪些)(?:个)?预约|(?:显示|列出)我今天的(?:所有)?预约)\s*[?。!]?$/u,
  ].some(pattern => pattern.test(question));
  if (!matches) return null;
  const zone = salonTimeZone(requestedTimeZone);
  const day = dateKeyInTimeZone(now.toISOString(), zone);
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  // Convert both local midnights separately: a DST day need not be 24 hours.
  return { start: zonedLocalToUtc(`${day}T00:00`, zone).toISOString(), end: zonedLocalToUtc(`${next}T00:00`, zone).toISOString() };
}
