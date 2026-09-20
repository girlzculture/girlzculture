"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { LOCALE_NAMES } from "@/i18n/catalog";
import { reusableReplyCopy } from "@/i18n/business-reusable-reply-copy";
import { getSessionForScope } from "@/lib/supabase";
import { OwnerActionError, readOwnerResponse } from "@/lib/ownerActionError";
import { parseReusableReplyAction, projectReusableReplyWorkspace, reusableReplyDraft, REPLY_LOCALES, type ReplyLocale, type ReusableReply, type ReusableReplyAction, type ReusableReplyWorkspace } from "@/lib/businessReusableReplies";

export type BusinessReusableRepliesProps = {
 businessId: string; actorId: string; conversationId: string; currentDraft: string; disabled?: boolean;
 // The composer rejects a changed draft/identity/conversation before replacing it.
 getDraftVersion: () => string;
 onUseDraft: (draft: { body: string; locale: string }, expectedCurrentDraft: string, expectedVersion: string) => boolean;
};
type Editor = { id: string; expected_revision: number | null; title: string; body: string; source_locale: ReplyLocale };
const button = "gc-disabled-control min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold";
const input = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-white p-2 text-sm";

function ReplyLibrary(props: BusinessReusableRepliesProps) {
 const { locale, formatNumber } = useI18n();
 const copy = (source: Parameters<typeof reusableReplyCopy>[1], values: Record<string, string> = {}) => reusableReplyCopy(locale, source, values);
 const prefix = useId();
 const [workspace, setWorkspace] = useState<ReusableReplyWorkspace | null>(null);
 const [archived, setArchived] = useState(false), [query, setQuery] = useState("");
 const [editor, setEditor] = useState<Editor | null>(null), [archive, setArchive] = useState<ReusableReply | null>(null);
 const [replacement, setReplacement] = useState<{ row: ReusableReply; expected: string; version: string } | null>(null);
 const [editConflict, setEditConflict] = useState(false);
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [reference, setReference] = useState(""), [notice, setNotice] = useState("");
 const live = useRef(true), pending = useRef(false);
 const intent = useRef<{ key: string; requestId: string } | null>(null);
 useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
 async function request(params: URLSearchParams, action?: ReusableReplyAction) {
  const session = await getSessionForScope("salon");
  if (!live.current || !session || session.user.id !== props.actorId) throw new OwnerActionError("AUTH_REQUIRED");
  params.set("business_id", props.businessId);
  const response = await fetch(`/api/salon/reusable-replies?${params}`, { method: action ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}`, ...(action ? { "Content-Type": "application/json" } : {}) }, ...(action ? { body: JSON.stringify(action) } : {}) });
  return readOwnerResponse(response, "REPLY_UNAVAILABLE");
 }
 function failure(value: unknown) {
  const code = value instanceof Error ? value.message : "REPLY_UNAVAILABLE";
  const stale = ["REPLY_STALE", "REPLY_NOT_FOUND", "REPLY_REQUEST_REUSED"].includes(code);
  if (stale && editor) setEditConflict(true);
  if (["REPLY_FORBIDDEN", "AUTH_REQUIRED"].includes(code)) { setWorkspace(null); setEditor(null); setArchive(null); setReplacement(null); }
  setReference(value instanceof OwnerActionError ? value.reference : "");
  setError(code === "AUTH_REQUIRED" ? copy("Please sign in again.") : code === "REPLY_FORBIDDEN" ? copy("You no longer have access to these business replies.") : code === "REPLY_INVALID" ? copy("Enter a title of up to 80 characters and a message of up to 2,000 characters.") : code === "REPLY_RATE_LIMIT" ? copy("Wait a moment before trying again.") : code === "REPLY_DRAFT_CHANGED" ? copy("Your draft changed. Review it before choosing a reply.") : stale ? copy(editor ? "Reply changed. Your edits are preserved. Keep them in a new reply, or discard them and reopen the current reply." : "Reply changed. Refresh the library before trying again.") : copy("Reusable replies are temporarily unavailable."));
 }
 async function run(operation: () => Promise<void>) {
  if (pending.current || props.disabled) return;
  pending.current = true; setBusy(true); setError(""); setReference(""); setNotice("");
  try { await operation(); } catch (value) { if (live.current) failure(value); }
  finally { pending.current = false; if (live.current) setBusy(false); }
 }
 async function load(offset = 0, showArchived = archived) {
  const body = await request(new URLSearchParams({ offset: String(offset), archived: String(showArchived), query }));
  const next = projectReusableReplyWorkspace(body, props.businessId);
  if (live.current) { setWorkspace(next); setArchived(showArchived); }
 }
 async function fresh(row: ReusableReply) {
  const body = await request(new URLSearchParams({ id: row.id }));
  const next = projectReusableReplyWorkspace(body, props.businessId);
  if (next.rows.length !== 1 || next.rows[0].id !== row.id || next.rows[0].revision !== row.revision) throw new OwnerActionError("REPLY_STALE");
  return next.rows[0];
 }
 async function insertReply(row: ReusableReply, expected: string, version: string, confirmed: boolean) {
  const current = await fresh(row);
  if (!live.current) return;
  if (props.getDraftVersion() !== version) throw new OwnerActionError("REPLY_DRAFT_CHANGED");
  if (expected.length && !confirmed) { setReplacement({ row: current, expected, version }); return; }
  if (!props.onUseDraft(reusableReplyDraft(current, props.businessId), expected, version)) throw new OwnerActionError("REPLY_DRAFT_CHANGED");
  setReplacement(null); setNotice(copy("Reply inserted. Review and send it yourself."));
 }
 async function mutate(value: Omit<Extract<ReusableReplyAction, { action: "save" }>, "request_id"> | Omit<Extract<ReusableReplyAction, { action: "archive" }>, "request_id">) {
  const key = JSON.stringify(value);
  if (!intent.current || intent.current.key !== key) intent.current = { key, requestId: crypto.randomUUID() };
  const action = parseReusableReplyAction({ ...value, request_id: intent.current.requestId });
  const body = await request(new URLSearchParams(), action);
  const verified = projectReusableReplyWorkspace({ salon_id: props.businessId, rows: [body.reply], total: 1, offset: 0, page_size: 25, archived: action.action === "archive" }, props.businessId).rows[0];
  if (verified.id !== action.id || verified.revision !== (action.expected_revision || 0) + 1 || action.action === "save" && (verified.title !== action.title || verified.body !== action.body || verified.source_locale !== action.source_locale)) throw new OwnerActionError("REPLY_STALE");
  if (!live.current) return;
  setEditor(null); setEditConflict(false); setArchive(null); setReplacement(null); intent.current = null;
  setNotice(copy(action.action === "save" ? "Reply saved." : "Reply archived."));
  await load(0);
 }
 const blocked = busy || Boolean(props.disabled), editing = Boolean(editor || archive || replacement);
 const newReply = () => { setError(""); setNotice(""); setEditConflict(false); setEditor({ id: crypto.randomUUID(), expected_revision: null, title: "", body: "", source_locale: REPLY_LOCALES.includes(locale as ReplyLocale) ? locale as ReplyLocale : "unknown" }); };
 return <details data-no-translate className="min-w-0 rounded-xl border border-border bg-white" onToggle={event => { if (event.currentTarget.open && !workspace && !pending.current) void run(() => load()); }}>
  <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">{copy("Reusable replies")}</summary>
  <section aria-label={copy("Reusable replies")} aria-busy={busy} className="min-w-0 space-y-3 border-t border-border p-3">
   <p className="text-sm text-muted">{copy("Private replies shared with your business team. Choosing one only fills an editable draft.")}</p>
   <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked || editing} onClick={newReply}>{copy("New reply")}</button><button type="button" className={button} disabled={blocked} onClick={() => void run(async () => { await load(); if (live.current) { setArchive(null); setReplacement(null); } })}>{copy("Refresh")}</button></div>
   <div className="flex flex-wrap gap-2"><button type="button" className={button} aria-pressed={!archived} disabled={blocked} onClick={() => void run(() => load(0, false))}>{copy("Active replies")}</button><button type="button" className={button} aria-pressed={archived} disabled={blocked} onClick={() => void run(() => load(0, true))}>{copy("Archived replies")}</button></div>
   <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm font-semibold" htmlFor={`${prefix}-search`}>{copy("Search replies")}<input id={`${prefix}-search`} className={input} maxLength={80} value={query} onChange={event => setQuery(event.target.value)}/></label><button type="button" className={button} disabled={blocked} onClick={() => void run(() => load())}>{copy("Search")}</button></div>
   {busy && <p role="status" className="text-sm">{copy("Loading reusable replies…")}</p>}{error && <p role="alert" className="break-words text-sm text-error">{error}{reference && <span className="block" translate="no">{copy("Reference: {id}", { id: reference })}</span>}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
   {editor && <fieldset disabled={blocked} className="min-w-0 space-y-3 rounded-lg bg-subtle p-3"><legend className="font-semibold">{copy(editor.expected_revision ? "Edit reply" : "New reply")}</legend>
    <label className="block text-sm font-semibold" htmlFor={`${prefix}-title`}>{copy("Title")}<input id={`${prefix}-title`} className={input} maxLength={80} value={editor.title} onChange={event => { const title = event.target.value; setEditor(current => current && { ...current, title }); }}/></label>
    <label className="block text-sm font-semibold" htmlFor={`${prefix}-body`}>{copy("Message")}<textarea id={`${prefix}-body`} className={`${input} min-h-32`} maxLength={2000} rows={5} value={editor.body} onChange={event => { const body = event.target.value; setEditor(current => current && { ...current, body }); }}/></label>
    <label className="block text-sm font-semibold" htmlFor={`${prefix}-locale`}>{copy("Original language")}<select id={`${prefix}-locale`} className={input} value={editor.source_locale} onChange={event => { const source_locale = event.target.value as ReplyLocale; setEditor(current => current && { ...current, source_locale }); }}>{REPLY_LOCALES.map(language => <option key={language} value={language}>{language === "unknown" ? copy("Unspecified") : LOCALE_NAMES[language]}</option>)}</select></label>
    {editConflict && <p className="text-sm">{copy("Reply changed. Your edits are preserved. Keep them in a new reply, or discard them and reopen the current reply.")}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={editConflict} onClick={() => void run(() => mutate({ action: "save", ...editor }))}>{copy("Save reply")}</button>{editConflict && <button type="button" className={button} onClick={() => { setEditor({ ...editor, id: crypto.randomUUID(), expected_revision: null }); setEditConflict(false); setError(""); intent.current = null; }}>{copy("Keep edits in a new reply")}</button>}<button type="button" className={button} onClick={() => { setEditor(null); setEditConflict(false); intent.current = null; }}>{copy("Discard edits")}</button></div>
   </fieldset>}
   {archive && <div role="group" aria-label={copy("Archive this reply?")} className="space-y-2 rounded-lg border border-border p-3"><h3 className="font-semibold">{copy("Archive this reply?")}</h3><p className="break-words" translate="no">{archive.title}</p><p className="text-sm">{copy("Archived replies cannot be inserted. Existing message drafts stay unchanged.")}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked} onClick={() => void run(() => mutate({ action: "archive", id: archive.id, expected_revision: archive.revision, confirm: true }))}>{copy("Confirm archive")}</button><button type="button" className={button} disabled={blocked} onClick={() => setArchive(null)}>{copy("Cancel")}</button></div></div>}
   {replacement && <div role="group" aria-label={copy("Replace current draft?")} className="space-y-2 rounded-lg border border-border p-3"><h3 className="font-semibold">{copy("Replace current draft?")}</h3><p className="text-sm">{copy("Your current draft will be replaced. Nothing is sent.")}</p><p className="whitespace-pre-wrap break-words text-sm" translate="no">{replacement.row.body}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked} onClick={() => void run(() => insertReply(replacement.row, replacement.expected, replacement.version, true))}>{copy("Replace draft")}</button><button type="button" className={button} disabled={blocked} onClick={() => setReplacement(null)}>{copy("Cancel")}</button></div></div>}
   {workspace && <><p className="text-sm text-muted">{copy("Showing {from}–{to} of {total}", { from: formatNumber(workspace.rows.length ? workspace.offset + 1 : 0), to: formatNumber(workspace.offset + workspace.rows.length), total: formatNumber(workspace.total) })}</p>
    {!workspace.rows.length && <p className="text-sm">{copy("No reusable replies match this view.")}</p>}
    <ul className="space-y-3">{workspace.rows.map(row => <li key={row.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3"><h3 className="break-words font-semibold" translate="no">{row.title}</h3><p className="whitespace-pre-wrap break-words text-sm" translate="no">{row.body}</p>{!row.archived_at && <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked || editing} onClick={() => { const version = props.getDraftVersion(); void run(() => insertReply(row, props.currentDraft, version, false)); }}>{copy("Use as draft")}</button><button type="button" className={button} disabled={blocked || editing} onClick={() => { setEditor({ id: row.id, expected_revision: row.revision, title: row.title, body: row.body, source_locale: row.source_locale }); setEditConflict(false); setError(""); setNotice(""); }}>{copy("Edit reply")}</button><button type="button" className={button} disabled={blocked || editing} onClick={() => setArchive(row)}>{copy("Archive reply")}</button></div>}</li>)}</ul>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked || workspace.offset === 0} onClick={() => void run(() => load(Math.max(0, workspace.offset - 25)))}>{copy("Previous")}</button><button type="button" className={button} disabled={blocked || workspace.offset + workspace.rows.length >= workspace.total} onClick={() => void run(() => load(workspace.offset + 25))}>{copy("Next")}</button></div>
   </>}
  </section>
 </details>;
}
export default function BusinessReusableReplies(props: BusinessReusableRepliesProps) {
 return <ReplyLibrary key={`${props.businessId}:${props.actorId}:${props.conversationId}`} {...props}/>;
}
