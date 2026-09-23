import { assistantMoneyReadText } from "@/i18n/assistant-money-read-copy";
import { manualSaleText } from "@/i18n/assistant-manual-sale-source-catalog";
import { assistantBalancesCopy } from "@/i18n/assistant-balances-copy";
import { assistantSettingsReadMessage } from "@/i18n/assistant-profile-settings-copy";
import { serviceCapacityCopy } from "@/i18n/business-service-capacity-copy";
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

  if (tool === "calculate_service_selection" || tool === "get_booking_price_details") {
    if (result.available !== true) return { message: assistantMoneyReadText("missing", locale) };
    const money = row(tool === "calculate_service_selection" ? result.money : result.original), current = row(result.current);
    const cents = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? currency(value / 100, locale) : assistantMoneyReadText("unavailable", locale);
    return { message: assistantMoneyReadText(tool === "calculate_service_selection" ? "selection" : "booking", locale, { total: cents(money.total_cents ?? money.agreed_total_cents), saving: cents(money.discount_cents), deposit: cents(money.protected_deposit_cents), balance: cents(money.remaining_balance_cents), unpaid: current.available === true ? cents(current.unpaid_cents) : assistantMoneyReadText("unavailable", locale) }) };
  }
  if (tool === "get_manual_sale_options") return { message: manualSaleText("I found the services and professionals you can use for a received-payment draft. Confirm the service, professional, amount and payment method.", locale) };
  if (tool === "get_outstanding_balances") {
    const balanceCopy=assistantBalancesCopy(locale);
    return {message:result.available===false?balanceCopy.incomplete:`${balanceCopy.asOf} ${text(result.as_of_day)}. ${balanceCopy.summary.replace('{completed}',currency(number(result.completed_unpaid_cents)/100,locale)).replace('{pending}',currency(number(result.pending_unpaid_cents)/100,locale))} ${balanceCopy.caveat}`};
  }
  if (tool === "get_services_and_prices") {
    const services = rows(result.services);
    const count = Math.max(number(result.matching_total ?? result.total), services.length);
    if (!count && result.match_status === "incomplete_search") return { message: t("Only part of your catalog was searched. Open Services & Pricing to check the remaining services."), suggestions: suggest(["Open Services & Pricing"]) };
    if (!count && number(result.inventory_total) > 0) return { message: t("No service matched this search. Your catalog contains {count} services.", { count: number(result.inventory_total) }), suggestions: suggest(["Find a service"]) };
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
      message: [result.match_status === "related" ? t("These are related services, not an exact name match. Confirm the service before making changes.") : "", result.search_complete === false ? t("Only part of your catalog was searched. Open Services & Pricing to check the remaining services.") : "", result.query ? t("Matching services: {count}. {details}", { count, details: list(summaries, locale) }) : words.services(count, list(summaries, locale), Math.max(0, count - summaries.length))].filter(Boolean).join(" "),
      suggestions: suggest(["Find a service", "Prepare a price change", "Import a spreadsheet"]),
    };
  }

  if (tool === "get_business_media") {
    return { message: [t("You have {gallery} gallery photos, {cover} cover image and {logo} logo image saved. There are {total} distinct saved images.", { gallery: number(result.gallery_count), cover: number(result.cover_count), logo: number(result.logo_count), total: number(result.distinct_saved_images) }), t(result.publicly_visible === true ? "Your gallery is visible on your public business page." : result.publicly_visible === false ? "Your business page is not currently public." : "Public visibility could not be verified.")].join(" "), suggestions: suggest(["Open Photos"]) };
  }

  if (tool === "get_business_profile") {
    const name = text(result.name, 100);
    const location = [text(result.address_city, 80), text(result.address_state, 40)].filter(Boolean).join(", ");
    return { message: [words.profile(name, location), text(result.description, 320)].filter(Boolean).join("\n\n"), suggestions: suggest(["Show my hours", "Update my description", "Open My Page"]) };
  }

  if (tool === "get_business_settings") return { message: assistantSettingsReadMessage(locale), suggestions: suggest(["Open Settings"]) };

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
    if (tool === "get_availability" && result.service_id) {
      const copy = (source: string, values: Record<string, string> = {}) => serviceCapacityCopy(locale, source, values);
      const message = result.available !== true
        ? copy(result.reason === "selection_required" ? "Choose the required service options, then check again." : "Service choices changed. Review the saved service before continuing.")
        : [copy("{total} start-time alternatives; showing {shown}.", { total: String(number(result.total)), shown: String(number(result.shown_count)) }), copy("{duration} minutes plus {buffer} minutes of buffer.", { duration: String(number(result.duration_minutes)), buffer: String(number(result.buffer_minutes)) }), copy("Start times overlap; this is not a count of extra appointments. No time is reserved. Booking checks customer eligibility and availability again.")].join(" ");
      return { message, suggestions: suggest(["Check another day", "Open calendar"]) };
    }
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
    const prose = text(policy.business_policy_text || [policy.refund_terms, policy.notes, policy.preparation].filter(Boolean).join(" "), 650);
    return { message: [prose, parts].filter(Boolean).join("\n\n") || words.policies(parts), suggestions: suggest(["Explain cancellations", "Explain deposits", "Open policies"]) };
  }

  if (tool === "get_client_record") return { message: t("I found the client history you are allowed to access. Open the client record in Bookings to review or update it.") };

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
    if (typeof result.completed_sales_cents === "number" && typeof result.cash_received_cents === "number") {
      const sales = currency(result.completed_sales_cents / 100, locale), receipts = currency(result.cash_received_cents / 100, locale);
      const balances = currency(number(result.unpaid_balance_cents) / 100, locale), period = row(result.period);
      const label = `${text(period.from)} – ${text(period.to)}`;
      const messages: Record<string, string> = {
        en: `${label}: completed sales ${sales}, payments received ${receipts}, unpaid balances ${balances}. Sales and receipts are separate figures. These are recorded amounts, not verified bank payouts.`,
        fr: `${label} : ventes réalisées ${sales}, paiements reçus ${receipts}, soldes impayés ${balances}. Les ventes et les encaissements sont distincts. Ces montants sont enregistrés et ne prouvent pas un versement bancaire.`,
        es: `${label}: ventas completadas ${sales}, pagos recibidos ${receipts}, saldos pendientes ${balances}. Las ventas y los cobros son cifras distintas. Son importes registrados, no pagos bancarios verificados.`,
        "zh-CN": `${label}：已完成销售额 ${sales}，已收款 ${receipts}，未付余额 ${balances}。销售额与收款是不同的金额。这些是已记录的金额，并非已核实的银行到账款项。`,
      };
      return { message: messages[locale] || messages.en, suggestions: suggest(["Open Finances"]) };
    }
    const amount = currency(result.completed_booking_value, locale);
    return { message: [t("Completed booking value"), amount || t("not available"), t("This is booking value, not verified cash revenue or a payout.")].join(" — "), suggestions: suggest(["Open finances"]) };
  }
  if (tool === "get_business_summary") {
    return { message: words.summary(number(result.bookings), number(result.upcoming), currency(result.completed_booking_value, locale) || t("not available")), suggestions: suggest(["Show upcoming bookings", "Find calendar gaps", "Open overview"]) };
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
