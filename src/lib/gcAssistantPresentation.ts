type Row = Record<string, unknown>;

export type AssistantPresentation = {
  message: string;
  suggestions?: string[];
  details?: unknown;
  details_label?: string;
};

import { copy, localeNames } from "@/i18n/gc-assistant-copy";
import { launchWorkspaceText } from "@/i18n/launch-workspace-source-catalog";
export { presentPreparedAssistantAction } from "@/i18n/gc-assistant-copy";

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Row[] : [];
}

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max) : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value: unknown, locale: string) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat(localeNames[locale] || "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
}

function list(values: string[], locale: string) {
  return new Intl.ListFormat(localeNames[locale] || "en-US", { style: "long", type: "conjunction" }).format(values.filter(Boolean));
}

function dateTime(value: unknown, locale: string, timeZone?: string) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "";
  try {
    return new Intl.DateTimeFormat(localeNames[locale] || "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timeZone || "UTC" }).format(new Date(value));
  } catch {
    return text(value);
  }
}

function namedList(items: Row[], locale: string, max = 4) {
  return list(items.slice(0, max).map(item => text(item.name || item.title || item.display_name || item.guest_name, 80)).filter(Boolean), locale);
}

export function presentAssistantResult(tool: string, value: unknown, locale = "en"): AssistantPresentation {
  const result = row(value);
  const language = Object.hasOwn(copy, locale) ? locale as keyof typeof copy : "en";
  const words = copy[language];
  const t = (source: string, values?: Record<string, string | number>) => launchWorkspaceText(source, language, values);
  const suggest = (items: string[]) => items.map(source => t(source));

  if (tool === "get_services_and_prices") {
    const services = rows(result.services);
    const count = Math.max(number(result.total), services.length);
    if (!count) return { message: words.none, suggestions: suggest(["Add a service", "Import a spreadsheet"]) };
    const summaries = services.slice(0, 4).map(service => {
      const name = text(service.name, 90) || t("Service");
      const price = currency(service.base_price ?? service.price_display_min, locale);
      const minimum = number(service.duration_min_hours);
      const maximum = number(service.duration_max_hours);
      const duration = minimum ? (maximum && maximum !== minimum ? t("{value0}–{value1} hr", { value0: minimum, value1: maximum }) : t("{value0} hr", { value0: minimum })) : "";
      return `${name}${price || duration ? ` (${[price, duration].filter(Boolean).join(", ")})` : ""}`;
    });
    return {
      message: words.services(count, list(summaries, locale), Math.max(0, count - summaries.length)),
      suggestions: suggest(["Find a service", "Prepare a price change", "Import a spreadsheet"]),
    };
  }

  if (tool === "get_business_profile") {
    const name = text(result.name, 100);
    const location = [text(result.address_city, 80), text(result.address_state, 40)].filter(Boolean).join(", ");
    return { message: [words.profile(name, location), text(result.description, 320)].filter(Boolean).join("\n\n"), suggestions: suggest(["Show my hours", "Update my description", "Open My Page"]) };
  }

  if (tool === "get_bookings" || tool === "get_upcoming_appointments") {
    const bookings = rows(result.bookings);
    const count = Math.max(number(result.total), bookings.length);
    const zone = text(result.time_zone, 80) || undefined;
    const summaries = bookings.slice(0, 4).map(booking => {
      const guest = text(booking.guest_name, 80) || t("Appointment");
      const when = dateTime(booking.appointment_datetime, locale, zone);
      return [guest, when].filter(Boolean).join(" — ");
    });
    return { message: words.bookings(count, list(summaries, locale)), suggestions: suggest(["Check tomorrow", "Find open time", "Open Bookings"]) };
  }

  if (tool === "get_availability" || tool === "get_calendar_gaps") {
    const slots = rows(result.slots || result.gaps);
    const labels = slots.slice(0, 4).map(slot => text(slot.label || slot.time, 40) || [dateTime(slot.start, locale, text(result.time_zone)), dateTime(slot.end, locale, text(result.time_zone)), text(slot.professional_name, 80)].filter(Boolean).join(" — ")).filter(Boolean);
    return { message: words.availability(slots.length, text(result.date, 20), list(labels, locale)), suggestions: suggest(["Check another day", "Block time", "Open calendar"]) };
  }

  if (tool === "get_business_policies") {
    const revision = row(result.policy);
    const policy = row(revision.policy || revision);
    const parts = [
      policy.cancellation_hours !== undefined ? t("Cancellation notice: {value0} hours", { value0: number(policy.cancellation_hours) }) : "",
      policy.rescheduling_hours !== undefined ? t("rescheduling notice: {value0} hours", { value0: number(policy.rescheduling_hours) }) : "",
      policy.walk_ins ? t("walk-ins: {value0}", { value0: text(policy.walk_ins, 40).replaceAll("_", " ") }) : "",
    ].filter(Boolean).join("; ");
    return { message: words.policies(parts), suggestions: suggest(["Explain cancellations", "Explain deposits", "Open policies"]) };
  }

  if (tool === "search_platform_knowledge") {
    const matches = rows(result.matches);
    const answers = matches.slice(0, 3).map(match => {
      const title = text(match.question || match.title, 120);
      const answer = text(match.answer || match.summary, 260);
      return `${title ? `${title}: ` : ""}${answer}`;
    }).filter(Boolean).join("\n\n");
    return { message: words.knowledge(matches.length, answers), suggestions: suggest(["Search another topic", "Open Help", "Contact support"]) };
  }

  if (tool === "get_earnings_summary") {
    const amount = currency(result.completed_booking_value, locale);
    return { message: amount ? [t("Completed booking value"), amount, t("This is booking value, not verified cash revenue or a payout.")].join(" — ") : words.none, suggestions: suggest(["Open earnings"]) };
  }
  if (tool === "get_business_summary") {
    return { message: words.summary(number(result.bookings), number(result.upcoming), currency(result.completed_booking_value, locale)), suggestions: suggest(["Show upcoming bookings", "Find calendar gaps", "Open overview"]) };
  }

  const lists: Record<string, [string, string]> = {
    get_professionals: ["professionals", "professional"], get_products: ["products", "product"], get_customers: ["customers", "customer"],
    get_reviews: ["reviews", "review"], get_promotions: ["promotions", "promotion"], get_booking_messages: ["messages", "message"],
  };
  if (lists[tool]) {
    const [key, label] = lists[tool];
    const items = rows(result[key]);
    const count = Math.max(number(result.total), items.length);
    return { message: count ? words.count(count, t(count === 1 ? label : key), namedList(items, locale)) : words.none };
  }

  if (tool === "get_profile_completion") {
    const completion = number(result.profile_completion);
    return { message: t("Your business profile is {value0}% complete. {value1}", { value0: completion, value1: words.ask }), suggestions: suggest(["What is missing?", "Open My Page"]) };
  }
  if (tool === "get_plan_status") {
    const subscription = row(result.subscription);
    return { message: t("Your current plan status is {value0}. {value1}", { value0: text(subscription.status, 40) || t("not available"), value1: words.ask }), suggestions: suggest(["Open Subscription", "Contact support"]) };
  }

  return { message: words.none };
}
