import { AssistantError, assertSchema } from "@/lib/gcAssistantCore";
import { isAssistantLanguage, type AssistantLanguage } from "@/lib/assistantLanguage";
import { MEMORY_TOOLS } from "@/lib/assistantMemory";

// Customer, booking, finance and free-text conversation history are deliberately
// excluded. These references only help resolve topics; business facts are read
// again by the existing permission-checked planner/tool path on every question.
type MemoryRow = { id: string; tool: string; permission: string; risk_class: number; failure_code: string | null };
export type MemoryInput = { consent: true; locale: AssistantLanguage; request_ids: string[] };

export function validateMemoryInput(input: unknown): MemoryInput {
  assertSchema(input, { type: "object", additionalProperties: false, required: ["consent", "locale", "request_ids"], properties: {
    consent: { type: "boolean", enum: [true] }, locale: { type: "string", enum: ["en", "fr", "es", "zh-CN", "wo"] },
    request_ids: { type: "array", maxItems: 6, items: { type: "string", maxLength: 36, pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" } },
  } });
  const value = input as MemoryInput;
  if (!isAssistantLanguage(value.locale) || value.consent !== true) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  return value;
}

/** Rows must first be scoped to the authenticated actor AND business by SQL. */
export function selectMemoryContext(rows: MemoryRow[], requested: string[], granted: ReadonlySet<string>) {
  const safe = new Set(rows.filter(row => row.risk_class === 1 && !row.failure_code && granted.has(row.permission) && (MEMORY_TOOLS as readonly string[]).includes(row.tool)).map(row => row.id));
  return [...new Set(requested)].filter(id => safe.has(id)).slice(-6);
}
