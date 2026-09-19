"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import SafeImage from "@/components/site/SafeImage";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import { MARKETING_LOCALES, type MarketingCopies, type MarketingLocale, type MarketingPost, type MarketingSnapshot, type MarketingSource } from "@/lib/businessMarketing";
import { zonedLocalToUtc } from "@/lib/dateTime";
import { rescheduleLocalTimestamp } from "@/lib/bookingRescheduleCore";

type Sources = { photos: { url: string; title?: string; category?: string }[]; services: { id: string; name: string }[]; promotions: { id: string; title: string; public_headline?: string }[]; completed_services: { id: string; style_id: string; appointment_datetime: string }[] };
type Workspace = { posts: MarketingPost[]; sources: Sources; time_zone: string; external_posting: false };
type Preview = { source: MarketingSource; snapshot: MarketingSnapshot; copies: MarketingCopies; booking_path: string; public_path: string };
const endpoint = "/api/salon/marketing";
const emptySource = (): MarketingSource => ({ photo_urls: [], service_id: null, promotion_id: null, booking_id: null });
const names = { en: "English", fr: "Français", es: "Español", "zh-CN": "简体中文" };
const field = "mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink";
const button = "min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink disabled:bg-subtle disabled:text-muted";
const primary = `${button} border-primary bg-primary text-white`;
export default function BusinessMarketing({ businessId }: { businessId: string }) {
  return <BusinessMarketingWorkspace key={businessId}/>;
}
function BusinessMarketingWorkspace() {
  const { locale, translateSource: t, formatDate } = useI18n();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [source, setSource] = useState<MarketingSource>(emptySource);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [post, setPost] = useState<MarketingPost | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<MarketingLocale>(MARKETING_LOCALES.includes(locale as MarketingLocale) ? locale as MarketingLocale : "en");
  const [reviewed, setReviewed] = useState<Partial<Record<MarketingLocale, boolean>>>({});
  const [mediaPermission, setMediaPermission] = useState(false);
  const [publishMode, setPublishMode] = useState("now"), [starts, setStarts] = useState(""), [ends, setEnds] = useState("");
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const pending = useRef(false), generation = useRef(0), draftId = useRef<string | null>(null);
  const approval = useRef<{ signature: string; body: Record<string, unknown> } | null>(null);
  const load = useCallback(async () => {
    const api = await createAuthenticatedApiClient("salon");
    return api.request<Workspace>(endpoint);
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    void load().then(data => { if (current === generation.current) setWorkspace(data); }).catch(failure => { if (current === generation.current) setError(scopedApiErrorMessage(failure, "Marketing content could not be loaded. Retry to verify your saved work.")); }).finally(() => { if (current === generation.current) setBusy(false); });
    return () => { generation.current = current + 1; pending.current = false; };
  }, [load]);
  function choose(saved: MarketingPost | null) {
    setPost(saved); setPreview(saved ? { source: saved.source, snapshot: saved.snapshot, copies: saved.copies, booking_path: saved.booking_path, public_path: saved.public_path } : null);
    setSource(saved?.source || emptySource()); setReviewed({}); setMediaPermission(false); setDirty(false); setError(""); setNotice("");
    draftId.current = saved?.id || null; approval.current = null;
    setPublishMode("now"); setStarts("");
    setEnds(rescheduleLocalTimestamp(saved?.expires_at || new Date(Date.now() + 30 * 86400_000).toISOString(), workspace?.time_zone || "America/New_York"));
  }
  async function run(action: "refresh" | "generate" | "save" | "approve" | "cancel") {
    if (pending.current) return;
    pending.current = true; const current = generation.current;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "refresh") {
        const data = await load();
        if (current === generation.current) {
          setWorkspace(data);
          const fresh = post && !dirty ? data.posts.find(item => item.id === post.id) : null;
          if (fresh) { setPost(fresh); setPreview(fresh); if (fresh.revision !== post?.revision) { setReviewed({}); setMediaPermission(false); approval.current = null; } }
          setNotice("Saved marketing status refreshed.");
        }
        return;
      }
      let body: Record<string, unknown>;
      if (action === "generate") body = { action, source };
      else if (action === "save" && preview) {
        draftId.current ||= crypto.randomUUID();
        body = { action, id: draftId.current, revision: post?.revision || 0, source: preview.source, copies: preview.copies };
      } else if (action === "approve" && post && !dirty) {
        const signature = JSON.stringify([post.id, post.revision, publishMode, starts, ends, reviewed, mediaPermission]);
        if (approval.current?.signature !== signature) approval.current = { signature, body: { action, id: post.id, revision: post.revision,
          scheduled_at: publishMode === "now" ? new Date().toISOString() : zonedLocalToUtc(starts, workspace?.time_zone).toISOString(),
          expires_at: zonedLocalToUtc(ends, workspace?.time_zone).toISOString(), reviewed_locales: MARKETING_LOCALES.filter(language => reviewed[language]), media_permission: mediaPermission, confirm: true } };
        body = approval.current.body;
      } else if (action === "cancel" && post) body = { action, id: post.id, revision: post.revision, confirm: true };
      else throw Error("MARKETING_ACTION_UNAVAILABLE");
      const api = await createAuthenticatedApiClient("salon");
      const result = await api.request<Preview & { verified?: boolean; post?: MarketingPost }>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (current !== generation.current) return;
      if (action === "generate") {
        setPreview(result); setPost(null); draftId.current = crypto.randomUUID(); setDirty(true); setReviewed({}); setMediaPermission(false);
        setEnds(rescheduleLocalTimestamp(new Date(Date.now() + 30 * 86400_000).toISOString(), workspace?.time_zone || "America/New_York"));
        setNotice("Draft prepared from your business records. Review and save it; nothing is published.");
      } else {
        if (result.verified !== true || !result.post) throw Error("MARKETING_READBACK_FAILED");
        setPost(result.post); setPreview(result.post); setDirty(false); setReviewed({}); setMediaPermission(false); approval.current = null;
        setWorkspace(value => value ? { ...value, posts: [result.post!, ...value.posts.filter(item => item.id !== result.post!.id)] } : value);
        setNotice(action === "save" ? "Marketing draft saved and verified." : action === "cancel" ? "Marketing publication cancelled and verified." : result.post.status === "published" ? "Published on your Girlz Culture business page. Nothing was posted externally." : "Approved and scheduled for your Girlz Culture business page. Nothing was posted externally.");
      }
    } catch (failure) {
      if (current === generation.current) setError(scopedApiErrorMessage(failure, "Marketing content could not be verified. Your entered work is still available to retry."));
    } finally { if (current === generation.current) { pending.current = false; setBusy(false); } }
  }
  function updateCopy(change: Partial<MarketingCopies[MarketingLocale]>) {
    setPreview(value => value ? { ...value, copies: { ...value.copies, [selectedLocale]: { ...value.copies[selectedLocale], ...change } } } : value);
    setDirty(true); setReviewed({}); setMediaPermission(false); approval.current = null;
  }
  function exportCopy() {
    if (!preview) return;
    const copy = preview.copies[selectedLocale];
    const blob = new Blob([`${copy.title}\n\n${copy.body}\n\n${copy.tags.join(" ")}\n\nhttps://girlzculture.com${preview.booking_path}\n\n${t("Manual social draft — not posted externally.")}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `business-marketing-${selectedLocale}.txt`; link.click(); URL.revokeObjectURL(url);
    setNotice("Social draft exported for manual review and posting. Nothing was posted externally.");
  }
  const readOnly = post?.status === "published";
  const canApprove = Boolean(post?.status === "draft" && !dirty && mediaPermission && MARKETING_LOCALES.every(language => reviewed[language]));
  const copy = preview?.copies[selectedLocale];
  return <section className="mt-6 space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-label={t("Marketing content")}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl text-heading">{t("Marketing content")}</h2><p className="mt-1 max-w-3xl text-sm text-muted">{t("Create editable captions from your own photos, services and offers. Approve each language before publishing on your business page.")}</p></div><button type="button" disabled={busy} onClick={() => void run("refresh")} className={button}>{t("Refresh marketing status")}</button></header>
    {error ? <p role="alert" className="break-words text-sm gc-text-danger">{t(error)}</p> : null}{notice ? <p role="status" className="text-sm text-ink">{t(notice)}</p> : null}{busy ? <p role="status" className="text-sm text-muted">{t("Checking marketing content…")}</p> : null}
    {!workspace ? <p className="text-sm text-muted">{t("Saved marketing data must load before you can make changes.")}</p> : <>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => choose(null)}>{t("New marketing draft")}</button><a href="#marketing-calendar" className={`${button} inline-flex items-center`}>{t("Marketing calendar")}</a></div>
      {!preview ? <div className="space-y-4 rounded-xl bg-subtle p-4"><div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">{t("Service")}<select className={field} value={source.service_id || ""} disabled={busy} onChange={event => setSource(value => ({ ...value, service_id: event.target.value || null, booking_id: null }))}><option value="">{t("No service selected")}</option>{workspace.sources.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <label className="text-sm">{t("Active promotion")}<select className={field} value={source.promotion_id || ""} disabled={busy} onChange={event => setSource(value => ({ ...value, promotion_id: event.target.value || null }))}><option value="">{t("No promotion selected")}</option>{workspace.sources.promotions.map(offer => <option key={offer.id} value={offer.id}>{offer.public_headline || offer.title}</option>)}</select></label>
        <label className="text-sm">{t("Completed service")}<select className={field} value={source.booking_id || ""} disabled={busy} onChange={event => { const visit = workspace.sources.completed_services.find(item => item.id === event.target.value); setSource(value => ({ ...value, booking_id: visit?.id || null, service_id: visit?.style_id || value.service_id })); }}><option value="">{t("No completed service selected")}</option>{workspace.sources.completed_services.map(visit => <option key={visit.id} value={visit.id}>{workspace.sources.services.find(service => service.id === visit.style_id)?.name || t("Service")} · {formatDate(visit.appointment_datetime, { dateStyle: "medium", timeZone: workspace.time_zone })}</option>)}</select></label>
      </div><fieldset><legend className="text-sm font-semibold">{t("Business portfolio photos — choose up to four")}</legend><div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">{workspace.sources.photos.map((photo, index) => <label key={photo.url} className="min-w-0 rounded-xl border border-border bg-surface p-2"><SafeImage src={photo.url} fallbackSrc={photo.url} alt={photo.title || t("Photo")} className="aspect-[4/3] w-full rounded-lg object-cover"/><span className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={source.photo_urls.includes(photo.url)} disabled={busy || source.photo_urls.length >= 4 && !source.photo_urls.includes(photo.url)} onChange={event => setSource(value => ({ ...value, photo_urls: event.target.checked ? [...value.photo_urls, photo.url] : value.photo_urls.filter(url => url !== photo.url) }))}/><span className="truncate" data-no-translate>{photo.title || `${t("Photo")} ${index + 1}`}</span></span></label>)}</div>{!workspace.sources.photos.length ? <p className="mt-2 text-sm text-muted">{t("No portfolio photos are saved. You can still draft from a service or offer.")}</p> : null}</fieldset><button type="button" disabled={busy || !source.photo_urls.length && !source.service_id && !source.promotion_id && !source.booking_id} className={primary} onClick={() => void run("generate")}>{t("Prepare multilingual draft")}</button></div> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
        <div className="min-w-0 space-y-4"><nav className="flex flex-wrap gap-2" aria-label={t("Content language")}>{MARKETING_LOCALES.map(language => <button key={language} type="button" aria-pressed={selectedLocale === language} onClick={() => setSelectedLocale(language)} className={selectedLocale === language ? primary : button}>{names[language]}</button>)}</nav>
          {copy ? <><label className="block text-sm">{t("Caption title")}<input className={field} value={copy.title} maxLength={160} disabled={busy || readOnly} onChange={event => updateCopy({ title: event.target.value })} data-no-translate/></label><label className="block text-sm">{t("Caption")}<textarea rows={9} className={field} value={copy.body} maxLength={2400} disabled={busy || readOnly} onChange={event => updateCopy({ body: event.target.value })} data-no-translate/></label><label className="block text-sm">{t("Hashtags")}<input className={field} value={copy.tags.join(" ")} disabled={busy || readOnly} onChange={event => updateCopy({ tags: event.target.value.split(/\s+/u).filter(Boolean) })} data-no-translate/></label></> : null}
          <div className="flex flex-wrap gap-2">{!readOnly ? <button type="button" disabled={busy || !dirty && post?.status === "draft"} onClick={() => void run("save")} className={primary}>{t("Save marketing draft")}</button> : null}<button type="button" disabled={busy} onClick={exportCopy} className={button}>{t("Export social draft")}</button></div><p className="text-xs text-muted">{t("Manual social draft — not posted externally.")}</p>
        </div>
        <aside className="min-w-0 space-y-4 rounded-xl bg-subtle p-4"><h3 className="font-serif text-xl">{t("Review facts and destination")}</h3><p className="text-sm" data-no-translate>{preview.snapshot.business.name}{preview.snapshot.service ? ` · ${preview.snapshot.service.name}` : ""}</p>{preview.snapshot.service ? <p className="text-sm" data-no-translate>USD {preview.snapshot.service.price_display_min ?? preview.snapshot.service.base_price ?? "—"} – {preview.snapshot.service.price_display_max ?? preview.snapshot.service.price_display_min ?? preview.snapshot.service.base_price ?? "—"}</p> : null}{preview.snapshot.promotion ? <p className="whitespace-pre-wrap text-sm" data-no-translate>{preview.snapshot.promotion.title}<br/>{preview.snapshot.promotion.terms}</p> : null}
          <div className="grid grid-cols-2 gap-2">{preview.snapshot.photos.map(photo => <SafeImage key={photo.url} src={photo.url} fallbackSrc={photo.url} alt={photo.title || t("Photo")} className="aspect-square w-full rounded-lg object-cover"/>)}</div>
          <Link className="block break-all text-sm text-primary underline" href={preview.booking_path} target="_blank" rel="noopener noreferrer">{t("Open booking destination")}</Link><Link className="block text-sm text-primary underline" href={`${preview.public_path}#business-updates`} target="_blank" rel="noopener noreferrer">{t("View business updates")}</Link>
          {post?.status === "draft" && !dirty ? <><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reviewed[selectedLocale] === true} disabled={busy} onChange={event => setReviewed(value => ({ ...value, [selectedLocale]: event.target.checked }))}/><span>{t("I reviewed the current language, facts, prices and terms.")} ({names[selectedLocale]})</span></label><p className="text-xs text-muted">{MARKETING_LOCALES.map(language => `${reviewed[language] ? "✓" : "○"} ${names[language]}`).join(" · ")}</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={mediaPermission} disabled={busy} onChange={event => setMediaPermission(event.target.checked)}/><span>{t("I have permission to publish the selected work and approve all four language versions.")}</span></label><label className="block text-sm">{t("Publication")}<select className={field} disabled={busy} value={publishMode} onChange={event => setPublishMode(event.target.value)}><option value="now">{t("Publish now")}</option><option value="schedule">{t("Schedule publication")}</option></select></label>{publishMode === "schedule" ? <label className="block text-sm">{t("Publish at")}<input className={field} type="datetime-local" disabled={busy} value={starts} onChange={event => setStarts(event.target.value)}/></label> : null}<label className="block text-sm">{t("Remove from public page at")}<input className={field} type="datetime-local" disabled={busy} value={ends} onChange={event => setEnds(event.target.value)}/></label><p className="text-xs text-muted">{t("Business time zone")}: <span data-no-translate>{workspace.time_zone}</span></p><button type="button" disabled={busy || !canApprove || !ends || publishMode === "schedule" && !starts} onClick={() => void run("approve")} className={primary}>{t("Approve business-page publication")}</button></> : <p className="text-sm text-muted">{t("Save edited content as a draft before reviewing publication.")}</p>}
          {post && post.status !== "cancelled" ? <button type="button" disabled={busy} onClick={() => void run("cancel")} className={button}>{t("Cancel publication and remove from business page")}</button> : null}
        </aside>
      </div>}
      <section id="marketing-calendar" className="space-y-3"><h3 className="font-serif text-xl">{t("Marketing calendar")}</h3><p className="text-sm text-muted">{t("Scheduled posts publish on the business page only. Source changes require a new review; expired posts are removed.")}</p><div className="grid gap-3 md:grid-cols-2">{workspace.posts.map(item => <article key={item.id} className="min-w-0 rounded-xl border border-border p-4"><h4 className="break-words font-semibold" data-no-translate>{item.copies[selectedLocale]?.title || item.copies.en.title}</h4><p className="mt-1 text-sm">{t(({ draft: "Draft", scheduled: "Scheduled", published: "Published", cancelled: "Cancelled", needs_review: "Needs review", expired: "Expired" })[item.status])}</p>{item.scheduled_at ? <p className="mt-1 text-xs text-muted">{formatDate(item.scheduled_at, { dateStyle: "medium", timeStyle: "short", timeZone: workspace.time_zone })} · {workspace.time_zone}</p> : null}{item.last_error ? <p className="mt-1 text-sm gc-text-warning">{t("The source or publication window changed. Edit and review again.")}</p> : null}<button type="button" disabled={busy} className={`${button} mt-3`} onClick={() => choose(item)}>{t("Open marketing content")}</button></article>)}</div>{!workspace.posts.length ? <p className="rounded-xl bg-subtle p-4 text-sm text-muted">{t("No marketing drafts yet. Start with your own services, offers or portfolio.")}</p> : null}</section>
    </>}
  </section>;
}
