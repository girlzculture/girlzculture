import "server-only";
import type { requireSalonPermission } from "@/lib/supabaseAdmin";
import { parseReusableReplyAction, projectReusableReplyWorkspace, ReusableReplyError, type ReusableReplyAction, type ReusableReplyQuery } from "@/lib/businessReusableReplies";
type Context = Awaited<ReturnType<typeof requireSalonPermission>>;
const errorCode = (error: unknown) => String((error as { message?: unknown })?.message || "").match(/REPLY_(?:FORBIDDEN|INVALID|STALE|NOT_FOUND|REQUEST_REUSED)/)?.[0];
function checked(error: unknown): never { throw new ReusableReplyError(errorCode(error) || "REPLY_UNAVAILABLE"); }
async function access(context: Context) {
  const result = await context.admin.rpc("p0_actor_has_permission", { p_salon: context.salon.id, p_user: context.user.id, p_permission: "bookings" });
  if (result.error) throw new ReusableReplyError("REPLY_UNAVAILABLE");
  if (result.data !== true) throw new ReusableReplyError("REPLY_FORBIDDEN");
}
export async function readBusinessReusableReplies(context: Context, query: ReusableReplyQuery) {
  await access(context);
  const result = await context.admin.rpc("business_reusable_replies_workspace", { p_salon: context.salon.id, p_actor: context.user.id, p_offset: query.offset, p_archived: query.archived, p_query: query.query, p_id: query.id });
  if (result.error) checked(result.error);
  const workspace = projectReusableReplyWorkspace(result.data, context.salon.id);
  if (workspace.offset !== query.offset || workspace.archived !== query.archived || query.id && workspace.rows.some(row => row.id !== query.id)) throw new ReusableReplyError("REPLY_UNAVAILABLE");
  await access(context);
  if (query.id && workspace.rows.length !== 1) throw new ReusableReplyError("REPLY_NOT_FOUND");
  return workspace;
}
export async function saveBusinessReusableReply(context: Context, input: ReusableReplyAction) {
  const action = parseReusableReplyAction(input);
  await access(context);
  const result = await context.admin.rpc("save_business_reusable_reply", { p_salon: context.salon.id, p_actor: context.user.id, p_action: action });
  if (result.error) checked(result.error);
  const expectedRevision = (action.expected_revision || 0) + 1;
  const workspace = await readBusinessReusableReplies(context, { offset: 0, archived: action.action === "archive", query: "", id: action.id });
  const saved = workspace.rows[0];
  if (!result.data || result.data.id !== action.id || result.data.salon_id !== context.salon.id || result.data.revision !== expectedRevision || saved.revision !== expectedRevision
    || action.action === "save" && (saved.title !== action.title || saved.body !== action.body || saved.source_locale !== action.source_locale)
    || action.action === "archive" && !saved.archived_at) throw new ReusableReplyError("REPLY_STALE");
  return saved;
}
