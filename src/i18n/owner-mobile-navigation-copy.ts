// Compact French labels are intentional navigation copy, not abbreviations of
// the accessible destination names. Other locales keep their existing catalog.
const FRENCH_MOBILE_DESTINATIONS: Record<string, { label: string; accessibleName: string }> = {
  overview: { label: "Résumé", accessibleName: "Vue d’ensemble" },
  bookings: { label: "RDV", accessibleName: "Réservations" },
  availability: { label: "Agenda", accessibleName: "Calendrier" },
  messages: { label: "Messages", accessibleName: "Messages" },
  settings: { label: "Plus", accessibleName: "Plus" },
};

export function ownerMobileDestinationCopy(locale: string, destination: string) {
  return locale === "fr" ? FRENCH_MOBILE_DESTINATIONS[destination] : undefined;
}
