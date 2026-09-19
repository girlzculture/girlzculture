"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getSessionForScope } from "@/lib/supabase";
import { OwnerActionError, readOwnerResponse } from "@/lib/ownerActionError";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { instagramOnboardingText } from "@/i18n/instagram-onboarding-copy";
import type { OnboardingDraft } from "@/lib/businessOnboardingDraft";

type Snapshot = { id: string; profile: { username: string; name?: string }; media: { id: string; preview_url: string; timestamp?: string }[]; shown_count: number; is_excerpt: boolean };
type Availability = { status: "unavailable" | "disconnected" | "connected"; account?: { username: string }; import?: Snapshot };
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2 font-semibold gc-disabled-control";
async function api(body?: Record<string, unknown>) {
 const session = await getSessionForScope("salon");
 if (!session) throw new OwnerActionError("ONBOARDING_ACCESS_DENIED");
 return readOwnerResponse(await fetch("/api/salon/onboarding-instagram", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), "ONBOARDING_INSTAGRAM_UNAVAILABLE");
}

export default function InstagramOnboardingSource({ disabled = false, onDraft, onBusyChange, onDisconnect }: { disabled?: boolean; onDraft: (draft: OnboardingDraft) => Promise<void>; onBusyChange: (busy: boolean) => void; onDisconnect: () => Promise<void> }) {
 const { locale, formatNumber } = useI18n();
 const copy = (key: Parameters<typeof instagramOnboardingText>[1]) => instagramOnboardingText(locale, key);
 const [availability, setAvailability] = useState<Availability | null>(null);
 const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
 const [selected, setSelected] = useState<string[]>([]);
 const [permitted, setPermitted] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState(false);
 const [reference, setReference] = useState("");
 const [notice, setNotice] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const request = useRef<{ signature: string; id: string } | null>(null);
 const running = useRef(false);
 const alive = useRef(true);
 useEffect(() => {
  alive.current = true;
  let active = true;
  void api().then((value: Availability) => { if (!active) return; if (!["unavailable", "disconnected", "connected"].includes(value.status)) throw new Error("Invalid status"); setAvailability(value); setSnapshot(value.import || null); setSelected([]); setError(false); setReference(""); })
   .catch(reason => { if (!active) return; setError(true); setReference(reason instanceof OwnerActionError ? reason.reference : ""); });
  return () => { active = false; alive.current = false; };
 }, [attempt]);
 async function act(action: "authorize" | "read" | "create_draft" | "disconnect") {
  if (running.current || disabled) return;
  if (action !== "disconnect" && !permitted) return;
  running.current = true; setBusy(true); onBusyChange(true); setError(false); setNotice(false); setReference("");
  try {
   let body: Record<string, unknown> = { action, ...(action === "authorize" ? { permitted: true } : {}) };
   if (action === "create_draft") {
    if (!snapshot || selected.length > 16) throw new Error("No import");
    const signature = JSON.stringify([snapshot.id, selected, locale]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    body = { action, import_id: snapshot.id, media_ids: selected, locale: ["en", "fr", "es", "zh-CN"].includes(locale) ? locale : "en", permitted: true, request_id: request.current.id };
   }
   const result = await api(body);
   if (!alive.current) return;
   if (action === "authorize") {
    const target = new URL(result.authorization_url);
    if (target.protocol !== "https:" || !["www.instagram.com", "api.instagram.com"].includes(target.hostname) || target.username || target.password || target.port || !/^\/oauth\/authorize\/?$/.test(target.pathname)) throw new Error("Invalid authorization destination");
    window.location.assign(target.href);
   } else if (action === "read") {
    if (!result.import?.id || !Array.isArray(result.import.media) || result.import.media.length > 16) throw new Error("Invalid import");
    setSnapshot(result.import); setAvailability({ status: "disconnected", account: { username: result.import.profile.username } }); setSelected([]); request.current = null;
   } else if (action === "disconnect") {
    if (result.disconnected !== true) throw new Error("Disconnect unverified");
    setAvailability({ status: "disconnected" }); setPermitted(false); setNotice(true);
    await onDisconnect();
   } else {
    if (result.verified !== true || result.published !== false || result.draft?.status !== "draft" || result.draft.source?.provider_import?.import_id !== snapshot?.id) throw new Error("Draft unverified");
    await onDraft(result.draft);
   }
  } catch (reason) {
   if (!alive.current) return;
   if (reason instanceof OwnerActionError && /ACCESS|FORBIDDEN|OWNER_REQUIRED/.test(reason.code)) { setAvailability({ status: "unavailable" }); setSnapshot(null); setSelected([]); setPermitted(false); }
   setError(true); setReference(reason instanceof OwnerActionError ? reason.reference : "");
  } finally { running.current = false; if (alive.current) { setBusy(false); onBusyChange(false); } }
 }
 return <section aria-label={copy("title")} className="space-y-4 rounded-xl border border-border bg-white p-4" data-no-translate>
  <h2 className="font-serif text-xl font-semibold">{copy("title")}</h2><p>{copy("intro")}</p>
  {error ? <div role="alert" className="rounded-lg bg-subtle p-3"><p>{copy("failed")}</p>{reference ? <p className="break-all text-sm">{copy("support")}: {reference}</p> : null}<button type="button" className={`${button} mt-2`} disabled={busy || disabled} onClick={() => setAttempt(value => value + 1)}>{copy("retry")}</button></div> : null}
  {notice ? <p role="status">{copy("disconnected")}</p> : null}
  {!availability ? <p>{copy("loading")}</p> : availability.status === "unavailable" ? <p>{copy("unavailable")}</p> : <>
   {availability.account && availability.status === "connected" ? <p>{copy("connected")}: <strong>@{availability.account.username}</strong></p> : null}{snapshot && availability.status === "disconnected" ? <p>{copy("retained")}</p> : null}
   <p className="text-sm">{copy("accountOnly")}</p>
   <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={permitted} disabled={busy || disabled} onChange={event => setPermitted(event.target.checked)} /><span>{copy("permission")}</span></label>
   <div className="flex flex-wrap gap-3">{availability.status === "disconnected" ? <button type="button" className={button} disabled={!permitted || busy || disabled} onClick={() => void act("authorize")}>{copy("connect")}</button> : !snapshot ? <button type="button" className={button} disabled={!permitted || busy || disabled} onClick={() => void act("read")}>{busy ? copy("working") : copy("read")}</button> : null}{availability.status === "connected" ? <button type="button" className={button} disabled={busy || disabled} onClick={() => void act("disconnect")}>{copy("disconnect")}</button> : null}</div>
  </>}
  {disabled ? <p className="text-sm">{copy("unsaved")}</p> : null}
  {snapshot && availability && availability.status !== "unavailable" ? <section aria-label={copy("media")} className="space-y-3 border-t border-border pt-4">
   <h3 className="font-semibold">{copy("media")}</h3><p>@{snapshot.profile.username}{snapshot.profile.name ? ` · ${snapshot.profile.name}` : ""}</p><p className="text-sm">{copy("private")}</p>
   {snapshot.is_excerpt ? <p>{copy("excerpt")}</p> : null}<p>{copy("limit")} {copy("selected")}: {formatNumber(selected.length)}</p>
   {snapshot.media.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{snapshot.media.map((photo, index) => <label key={photo.id} className="block rounded-lg border border-border p-2"><Image src={photo.preview_url} alt={`${copy("photo")} ${formatNumber(index + 1)}`} width={320} height={240} unoptimized className="aspect-[4/3] w-full rounded object-contain" /><span className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`${copy("photo")} ${formatNumber(index + 1)}`} className="size-5 shrink-0" disabled={busy || disabled || !selected.includes(photo.id) && selected.length >= 16} checked={selected.includes(photo.id)} onChange={event => setSelected(current => event.target.checked ? [...current, photo.id] : current.filter(id => id !== photo.id))} />{copy("photo")} {formatNumber(index + 1)}</span></label>)}</div> : <p>{copy("empty")}</p>}
   <p className="text-sm">{copy("evidence")}</p><button type="button" className={`${button} bg-primary text-white`} disabled={busy || disabled || !permitted} onClick={() => void act("create_draft")}>{busy ? copy("working") : copy("draft")}</button>
  </section> : null}
 </section>;
}
