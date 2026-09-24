// Compact labels are intentional navigation copy, with complete accessible
// destination names. Never split a destination label into letter fragments.
const ENGLISH_MOBILE_DESTINATIONS: Record<string, { label: string; accessibleName: string }> = {
  overview: { label: "Overview", accessibleName: "Overview" },
  bookings: { label: "Bookings", accessibleName: "Bookings" },
  availability: { label: "Calendar", accessibleName: "Calendar" },
  messages: { label: "Messages", accessibleName: "Messages" },
  settings: { label: "More", accessibleName: "More" },
};
const CHINESE_MOBILE_DESTINATIONS: Record<string, { label: string; accessibleName: string }> = {
  overview: { label: "概览", accessibleName: "概览" },
  bookings: { label: "预约", accessibleName: "预约" },
  availability: { label: "日历", accessibleName: "日历" },
  messages: { label: "消息", accessibleName: "消息" },
  settings: { label: "更多", accessibleName: "更多" },
};
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
    : locale === "es" ? SPANISH_MOBILE_DESTINATIONS[destination]
    : locale === "zh-CN" ? CHINESE_MOBILE_DESTINATIONS[destination]
    : ENGLISH_MOBILE_DESTINATIONS[destination];
}
