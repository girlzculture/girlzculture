import { customerSupportText } from "@/i18n/customer-support-source-catalog";

export type CustomerConversationTurn = { question: string; answer: string; language: string };

/** An editable excerpt, never an invented diagnosis or an automatic transmission. */
export function customerSupportSummary(turns: CustomerConversationTurn[], failure: string, locale: string) {
  const recent = turns.slice(-2);
  return [
    customerSupportText("GC Assistant support", locale),
    ...recent.map(turn => `${customerSupportText("My question", locale)}: ${turn.question.slice(0, 600)}`),
    recent.length ? `${customerSupportText("Last assistant response (excerpt)", locale)}: ${recent.at(-1)!.answer.slice(0, 700)}` : "",
    failure ? `${customerSupportText("Reported error", locale)}: ${failure.slice(0, 700)}` : "",
  ].filter(Boolean).join("\n\n");
}

export function confirmedSupportReference(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
