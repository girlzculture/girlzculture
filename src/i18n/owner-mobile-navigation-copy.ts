// Compact labels are intentional navigation copy, with complete accessible
// destination names. Other locales keep their existing catalog.
const FRENCH_MOBILE_DESTINATIONS: Record<string, { label: string; accessibleName: string }> = {
  overview: { label: "Résumé", accessibleName: "Vue d’ensemble" },
  bookings: { label: "RDV", accessibleName: "Réservations" },
  availability: { label: "Agenda", accessibleName: "Calendrier" },
  messages: { label: "Messages", accessibleName: "Messages" },
  settings: { label: "Plus", accessibleName: "Plus" },
};

const SPANISH_MOBILE_DESTINATIONS: Record<string, { label: string; accessibleName: string }> = {
  overview: { label: "Inicio", accessibleName: "Resumen" },
  bookings: { label: "Reservas", accessibleName: "Reservas" },
  availability: { label: "Agenda", accessibleName: "Calendario" },
  messages: { label: "Mensajes", accessibleName: "Mensajes" },
  settings: { label: "Más", accessibleName: "Más" },
};

export function ownerMobileDestinationCopy(locale: string, destination: string) {
  return locale === "fr" ? FRENCH_MOBILE_DESTINATIONS[destination]
    : locale === "es" ? SPANISH_MOBILE_DESTINATIONS[destination] : undefined;
}
