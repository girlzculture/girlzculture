export const REPLY_PAGE_SIZE = 25;
export const REPLY_LOCALES = ["en", "fr", "es", "zh-CN", "unknown"] as const;
export type ReplyLocale = typeof REPLY_LOCALES[number];
export type ReusableReply = { id: string; salon_id: string; title: string; body: string; source_locale: ReplyLocale; revision: number; archived_at: string | null; updated_at: string };
export type ReusableReplyWorkspace = { salon_id: string; rows: ReusableReply[]; total: number; offset: number; page_size: number; archived: boolean };
export type ReusableReplyQuery = { offset: number; archived: boolean; query: string; id: string | null };
export type ReusableReplyAction = { action: "save"; id: string; request_id: string; expected_revision: number | null; title: string; body: string; source_locale: ReplyLocale } | { action: "archive"; id: string; request_id: string; expected_revision: number; confirm: true };
export class ReusableReplyError extends Error { constructor(public code: string) { super(code); } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) < 2_147_483_647;
const text = (value: unknown, maximum: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !value.includes("\0");
const locale = (value: unknown): value is ReplyLocale => REPLY_LOCALES.includes(value as ReplyLocale);
const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

export function parseReusableReplyAction(value: unknown): ReusableReplyAction {
  if (!object(value) || !validId(value.id) || !validId(value.request_id)) throw new ReusableReplyError("REPLY_INVALID");
  const allowed = value.action === "save" ? ["action", "id", "request_id", "expected_revision", "title", "body", "source_locale"] : ["action", "id", "request_id", "expected_revision", "confirm"];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ReusableReplyError("REPLY_INVALID");
  if (value.action === "save" && (value.expected_revision === null || revision(value.expected_revision)) && text(value.title, 80) && text(value.body, 2000) && locale(value.source_locale)) return value as ReusableReplyAction;
  if (value.action === "archive" && revision(value.expected_revision) && value.confirm === true) return value as ReusableReplyAction;
  throw new ReusableReplyError("REPLY_INVALID");
}

export function parseReusableReplyQuery(params: URLSearchParams): ReusableReplyQuery {
  if ([...params.keys()].some(key => !["business_id", "offset", "archived", "query", "id"].includes(key)) || [...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) throw new ReusableReplyError("REPLY_INVALID");
  const rawOffset = params.get("offset") || "0", archived = params.get("archived") || "false", query = params.get("query") || "", id = params.get("id");
  if (!/^\d{1,7}$/.test(rawOffset) || !["true", "false"].includes(archived) || query.length > 80 || query.includes("\0") || id !== null && !validId(id)) throw new ReusableReplyError("REPLY_INVALID");
  return { offset: Number(rawOffset), archived: archived === "true", query, id };
}

export function projectReusableReplyWorkspace(value: unknown, salonId: string): ReusableReplyWorkspace {
  if (!object(value) || value.salon_id !== salonId || !Array.isArray(value.rows) || value.rows.length > REPLY_PAGE_SIZE || !Number.isSafeInteger(value.total) || Number(value.total) < 0 || !Number.isSafeInteger(value.offset) || Number(value.offset) < 0 || value.page_size !== REPLY_PAGE_SIZE || typeof value.archived !== "boolean") throw new ReusableReplyError("REPLY_UNAVAILABLE");
  const rows = value.rows.map(row => {
    if (!object(row) || !validId(row.id) || row.salon_id !== salonId || !text(row.title, 80) || !text(row.body, 2000) || !locale(row.source_locale) || !revision(row.revision) || !instant(row.updated_at) || row.archived_at !== null && !instant(row.archived_at) || Boolean(row.archived_at) !== value.archived) throw new ReusableReplyError("REPLY_UNAVAILABLE");
    return { id: row.id, salon_id: salonId, title: row.title, body: row.body, source_locale: row.source_locale, revision: row.revision, archived_at: row.archived_at, updated_at: row.updated_at } as ReusableReply;
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length || rows.length !== Math.min(REPLY_PAGE_SIZE, Math.max(0, Number(value.total) - Number(value.offset)))) throw new ReusableReplyError("REPLY_UNAVAILABLE");
  return { salon_id: salonId, rows, total: Number(value.total), offset: Number(value.offset), page_size: REPLY_PAGE_SIZE, archived: value.archived };
}

export function reusableReplyDraft(reply: ReusableReply, salonId: string) {
  if (reply.salon_id !== salonId) throw new ReusableReplyError("REPLY_UNAVAILABLE");
  if (reply.archived_at) throw new ReusableReplyError("REPLY_NOT_FOUND");
  const verified = projectReusableReplyWorkspace({ salon_id: salonId, rows: [reply], total: 1, offset: 0, page_size: REPLY_PAGE_SIZE, archived: false }, salonId).rows[0];
  return { body: verified.body, locale: verified.source_locale };
}
