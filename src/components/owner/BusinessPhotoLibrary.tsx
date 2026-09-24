"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronDown, ImagePlus, Images, Pencil, Star, Upload, X } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import SafeImage from "@/components/site/SafeImage";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { getSessionForScope } from "@/lib/supabase";
import { OwnerActionError, readOwnerResponse } from "@/lib/ownerActionError";
import { BUSINESS_PHOTO_CATEGORIES, defaultPhotoDetails, publicGalleryPhotos, validatePhotoDetails, type BusinessPhotoCategory, type BusinessPhotoDetails, type BusinessPhotoMetadata } from "@/lib/businessPhotoMetadata";
import { businessPhotoRecoveryCopy } from "@/i18n/business-photo-recovery-copy";
import { businessPhotoLayoutCopy } from "@/i18n/business-photo-layout-copy";

type BusinessMedia = { id: string; name?: string; slug?: string; is_demo?: boolean; gallery_photos?: string[]; photo_metadata?: BusinessPhotoMetadata; cover_photo_url?: string; logo_url?: string };
export default function BusinessPhotoLibrary({ salon, onSaved }: { salon: BusinessMedia; onSaved: (patch: Partial<BusinessMedia>) => void }) {
  const { locale, translateSource: t, formatNumber } = useI18n();
  const recoveryCopy = businessPhotoRecoveryCopy(locale);
  const layoutCopy = businessPhotoLayoutCopy(locale);
  const galleryHref = salon.is_demo === true ? "/salon/dashboard/demo-page" : `/salon/${salon.slug}`;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [gallery, setGallery] = useState(() => publicGalleryPhotos(salon.gallery_photos));
  const [metadata, setMetadata] = useState<BusinessPhotoMetadata>(salon.photo_metadata || {});
  const [category, setCategory] = useState<BusinessPhotoCategory | "all">("all");
  const [uploadCategory, setUploadCategory] = useState<BusinessPhotoCategory>("other");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<BusinessPhotoDetails>(() => defaultPhotoDetails("other", locale));
  const [expected, setExpected] = useState<BusinessPhotoDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reference, setReference] = useState("");
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<"unavailable" | "removed" | "">("");
  const [savedSnapshot, setSavedSnapshot] = useState<BusinessPhotoDetails | null | undefined>(undefined);
  const editorEpoch = useRef(0);
  const reloadPending = useRef(false);
  const [pendingCategories, setPendingCategories] = useState<Record<string, BusinessPhotoCategory>>({});
  const [failedCategories, setFailedCategories] = useState<Record<string, boolean>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const uploadArea = useRef<HTMLDetailsElement>(null);
  const metadataRef = useRef(metadata);
  const persistedGallery = useRef(gallery);
  const queue = useRef(Promise.resolve());

  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  useEffect(() => () => { editorEpoch.current++; }, [salon.id]);
  function fail(error: unknown) {
    if (error instanceof Error && error.message === "PHOTO_STALE") { setStale(true); setSavedSnapshot(undefined); }
    setNotice(error instanceof Error && error.message === "PHOTO_STALE" ? "This photo changed in another session. Your edits are kept; reload the saved details before trying again." : "Photo details could not be saved. Your edits are kept.");
    setReference(error instanceof OwnerActionError ? error.reference : "");
  }
  async function persist(url: string, details: BusinessPhotoDetails, expectedDetails: BusinessPhotoDetails | null) {
    const session = await getSessionForScope("salon");
    if (!session) throw new Error("AUTH_REQUIRED");
    const response = await fetch("/api/salon/photos", { method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ url, details, expected_details: expectedDetails }) });
    const result = await readOwnerResponse(response, "PHOTO_UNAVAILABLE");
    if (result.verified !== true || !result.photo_metadata) throw new Error("PHOTO_UNAVAILABLE");
    metadataRef.current = result.photo_metadata;
    setMetadata(result.photo_metadata);
    onSaved({ photo_metadata: result.photo_metadata });
  }
  function applyUploadCategory(url: string, chosen: BusinessPhotoCategory) {
    // Serialize metadata saves for a multi-file upload. Each uses the latest
    // saved metadata, while the image itself remains in the existing pipeline.
    queue.current = queue.current.then(async () => {
      setFailedCategories(current => ({ ...current, [url]: false }));
      try {
        await persist(url, { ...(metadataRef.current[url] || defaultPhotoDetails(chosen, locale)), category: chosen }, metadataRef.current[url] || null);
        setPendingCategories(current => { const next = { ...current }; delete next[url]; return next; });
      } catch (error) { fail(error); setFailedCategories(current => ({ ...current, [url]: true })); }
    });
  }
  function uploaded(value: string | string[] | null) {
    const next = publicGalleryPhotos(value);
    const added = next.filter(url => !persistedGallery.current.includes(url));
    persistedGallery.current = next;
    setGallery(next);
    onSaved({ gallery_photos: next });
    for (const url of added) {
      setPendingCategories(current => ({ ...current, [url]: uploadCategory }));
      applyUploadCategory(url, uploadCategory);
    }
  }
  function openUpload() {
    setUploadCategory(category === "all" ? "other" : category);
    if (uploadArea.current) { uploadArea.current.open = true; uploadArea.current.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }
  function edit(url: string) {
    editorEpoch.current++; reloadPending.current = false;
    setStale(false); setReloading(false); setSavedSnapshot(undefined); setRecoveryError("");
    const saved = metadataRef.current[url] || null;
    setExpected(saved); setDraft(saved || defaultPhotoDetails(pendingCategories[url] || "other", locale));
    setNotice(""); setReference(""); setSelected(url);
  }
  function closeEditor() {
    editorEpoch.current++; reloadPending.current = false;
    setReloading(false); setRecoveryError(""); setSelected(null);
  }
  async function reloadSavedDetails() {
    if (!selected || busy || reloadPending.current) return;
    const url = selected, epoch = ++editorEpoch.current;
    reloadPending.current = true; setReloading(true); setNotice(""); setReference(""); setRecoveryError("");
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("AUTH_REQUIRED");
      const response = await fetch("/api/salon/profile", { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await readOwnerResponse(response, "PHOTO_UNAVAILABLE");
      if (epoch !== editorEpoch.current) return;
      if (result.salon?.id !== salon.id || !Array.isArray(result.salon.gallery_photos)) throw new Error("PHOTO_UNAVAILABLE");
      const latestGallery = publicGalleryPhotos(result.salon.gallery_photos);
      if (!latestGallery.includes(url)) throw new Error("PHOTO_NOT_FOUND");
      const raw = result.salon.photo_metadata ?? {};
      if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("PHOTO_UNAVAILABLE");
      const latestMetadata: BusinessPhotoMetadata = {};
      for (const photo of latestGallery) if (Object.hasOwn(raw, photo)) latestMetadata[photo] = validatePhotoDetails(raw[photo]);
      const latest = latestMetadata[url] || null;
      metadataRef.current = latestMetadata; persistedGallery.current = latestGallery;
      setMetadata(latestMetadata); setGallery(latestGallery); setExpected(latest); setSavedSnapshot(latest);
      onSaved({ gallery_photos: latestGallery, photo_metadata: latestMetadata });
      // Retain every owner draft field; only a new explicit save may replace
      // this freshly displayed snapshot using its current concurrency token.
      setStale(false);
    } catch (error) {
      if (epoch !== editorEpoch.current) return;
      setRecoveryError(error instanceof Error && error.message === "PHOTO_NOT_FOUND" ? "removed" : "unavailable");
      setReference(error instanceof OwnerActionError ? error.reference : "");
    } finally {
      if (epoch === editorEpoch.current) { reloadPending.current = false; setReloading(false); }
    }
  }
  const visible = gallery.filter(url => category === "all" || (metadata[url]?.category || pendingCategories[url] || "other") === category);
  return <div className="space-y-4 lg:space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-serif text-3xl text-ink sm:text-4xl">{t("Photos")}</h1><p className="mt-1 text-sm text-muted lg:mt-2">{t("Showcase your work. Attract more clients. Grow your business.")}</p></div><div className="flex flex-wrap gap-2"><Link href={galleryHref} className="hidden min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold lg:flex">{t("View public gallery")}</Link><button type="button" onClick={openUpload} className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Upload size={17}/>{t("Upload Photos")}</button><button type="button" aria-expanded={toolsOpen} aria-controls="business-photo-tools" onClick={() => setToolsOpen(open => !open)} data-no-translate className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold lg:hidden">{layoutCopy.tools}<ChevronDown aria-hidden="true" size={16} className={toolsOpen ? "rotate-180" : ""}/></button></div></header>
    <section id="business-photo-tools" aria-label={layoutCopy.tools} className={`space-y-4 ${toolsOpen ? "block" : "hidden lg:block"}`}>
      <Link href={galleryHref} className="flex min-h-11 w-fit items-center rounded-xl border border-border px-4 text-sm font-semibold lg:hidden">{t("View public gallery")}</Link>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Gallery photos", gallery.length, Images], ["Cover photo", salon.cover_photo_url ? 1 : 0, Camera], ["Business logo", salon.logo_url ? 1 : 0, ImagePlus], ["Featured photos", gallery.filter(url => metadata[url]?.featured).length, Star]].map(([label,value,Icon]) => { const MetricIcon = Icon as typeof Images; return <div key={String(label)} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white p-4"><div><p className="text-xs text-muted">{t(String(label))}</p><p className="mt-2 font-serif text-2xl">{formatNumber(Number(value))}</p></div><MetricIcon size={20} className="shrink-0 text-primary"/></div>; })}</div>
    <div className="grid gap-4 sm:grid-cols-2"><button onClick={openUpload} className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5 text-primary"><Upload size={32}/><span className="font-semibold">{t("Add photos of your work")}</span><span className="text-xs">{t("Select a category, then upload and crop your images.")}</span></button><div className="relative h-40 overflow-hidden rounded-2xl border border-border bg-primary/5">{salon.cover_photo_url ? <SafeImage src={salon.cover_photo_url} fallbackSrc={salon.cover_photo_url} alt={salon.name || t("Cover photo")} className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center text-sm text-muted">{t("No cover photo yet")}</div>}<div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2"><Link href="/salon/dashboard/photos/cover" className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold"><Camera size={15}/>{t("Change cover photo")}</Link><Link href="/salon/dashboard/photos/logo" className="flex min-h-10 items-center rounded-lg bg-white px-3 text-xs font-semibold">{t("Change business logo")}</Link></div></div></div>
    </section>
    <div role="group" aria-label={t("Photo categories")} className="flex gap-2 overflow-x-auto pb-1">{([["all", "All Photos"], ...Object.entries(BUSINESS_PHOTO_CATEGORIES)] as [BusinessPhotoCategory | "all", string][]).map(([key,label]) => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)} className={`min-h-11 shrink-0 rounded-full px-4 text-xs font-semibold ${category === key ? "bg-primary text-white" : "border border-border bg-white text-muted"}`}>{t(label)} ({formatNumber(key === "all" ? gallery.length : gallery.filter(url => (metadata[url]?.category || pendingCategories[url] || "other") === key).length)})</button>)}</div>
    {notice ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{t(notice)}{reference ? <p className="mt-1 break-words text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}</div> : null}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">{visible.map((url,index) => <article key={url} className="min-w-0 overflow-hidden rounded-xl border border-border bg-white"><div className="relative aspect-[4/3]"><SafeImage src={url} fallbackSrc={url} alt={metadata[url]?.title || `${t("Photo")} ${gallery.indexOf(url) + 1}`} className="h-full w-full object-cover"/>{metadata[url]?.featured ? <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs"><Star size={13} className="gc-text-warning"/>{t("Featured")}</span> : null}</div><div className="space-y-2 p-3"><h2 className="truncate text-sm font-semibold" data-no-translate>{metadata[url]?.title || `${t("Photo")} ${gallery.indexOf(url) + 1}`}</h2><p className="text-xs text-muted">{t(BUSINESS_PHOTO_CATEGORIES[metadata[url]?.category || pendingCategories[url] || "other"])}</p>{metadata[url]?.caption ? <p className="line-clamp-2 break-words text-xs text-muted" data-no-translate>{metadata[url].caption}</p> : null}<button onClick={() => edit(url)} aria-label={`${t("Edit photo details")} ${index + 1}`} className="flex min-h-10 items-center gap-2 text-xs font-semibold text-primary"><Pencil size={14}/>{t("Edit details")}</button>{pendingCategories[url] && failedCategories[url] ? <button onClick={() => applyUploadCategory(url, pendingCategories[url])} className="min-h-10 text-xs gc-text-warning">{t("Retry saving category")}</button> : pendingCategories[url] ? <p className="text-xs text-muted">{t("Saving category…")}</p> : null}</div></article>)}</div>
    {!visible.length ? <div className="rounded-2xl border border-dashed border-border p-8 text-center"><Images className="mx-auto text-primary"/><p className="my-3 text-sm">{t("No photos in this category yet.")}</p><button onClick={openUpload} className="min-h-11 rounded-xl bg-primary px-5 text-sm text-white">{t("Upload Photos")}</button></div> : null}
    <details ref={uploadArea} className="rounded-2xl border border-border bg-white p-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{t("Upload, crop and arrange photos")}</summary><p className="mb-4 text-sm">{t("New photos will be added to")}: <b>{t(BUSINESS_PHOTO_CATEGORIES[uploadCategory])}</b></p><ImageUpload authScope="salon" bucket="salon-photos" preset="gallery" multiple maxFiles={16} folder={`salons/${salon.id}/gallery`} label="Media Library" value={gallery} onChange={value => setGallery(publicGalleryPhotos(value))} attachment={{ record_type: "salon", record_id: salon.id, field: "gallery_photos" }} onPersisted={uploaded}/></details>
    <dialog ref={dialog} onClose={closeEditor} aria-labelledby="photo-details-title" className="m-auto max-h-[90dvh] w-[min(95vw,560px)] overflow-y-auto rounded-2xl border border-border bg-white p-5 text-ink backdrop:bg-black/30"><form onSubmit={async event => { event.preventDefault(); if (!selected || busy || stale || reloading) return; setBusy(true); setNotice(""); setReference(""); try { await persist(selected, draft, expected); setSelected(null); } catch (error) { fail(error); } finally { setBusy(false); } }} className="space-y-4"><header className="flex items-center justify-between gap-3"><h2 id="photo-details-title" className="font-serif text-2xl">{t("Edit photo details")}</h2><button type="button" onClick={closeEditor} aria-label={t("Close")} className="grid h-11 w-11 place-items-center"><X size={20}/></button></header>{notice ? <p role="alert" className="text-sm gc-text-danger">{t(notice)} {reference}</p> : null}{recoveryError ? <p role="alert" data-no-translate className="text-sm gc-text-danger">{recoveryCopy[recoveryError]} {reference}</p> : null}{stale ? <button type="button" disabled={busy || reloading} onClick={() => void reloadSavedDetails()} data-no-translate className="min-h-11 rounded-lg border border-primary px-3 text-sm font-semibold text-primary gc-disabled-control">{reloading ? recoveryCopy.loading : recoveryCopy.reload}</button> : null}{savedSnapshot !== undefined ? <section data-no-translate aria-label={recoveryCopy.saved} className="space-y-2 rounded-xl border border-border bg-subtle p-3 text-sm"><h3 className="font-semibold">{recoveryCopy.saved}</h3><p>{t(BUSINESS_PHOTO_CATEGORIES[savedSnapshot?.category || "other"])}</p><p className="break-words">{savedSnapshot?.title || "—"}</p><p className="whitespace-pre-wrap break-words">{savedSnapshot?.caption || "—"}</p><p>{t("Featured photo")}: {t(savedSnapshot?.featured ? "Yes" : "No")}</p><p>{recoveryCopy.review}</p></section> : null}<label className="block text-sm font-semibold">{t("Category")}<select value={draft.category} onChange={event => setDraft(value => ({ ...value, category: event.target.value as BusinessPhotoCategory }))} className="mt-2 min-h-11 w-full rounded-lg border border-border p-2">{Object.entries(BUSINESS_PHOTO_CATEGORIES).map(([value,label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><label className="block text-sm font-semibold">{t("Title")}<input value={draft.title} maxLength={120} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-border p-3"/></label><label className="block text-sm font-semibold">{t("Caption")}<textarea rows={4} value={draft.caption} maxLength={1000} onChange={event => setDraft(value => ({ ...value, caption: event.target.value }))} className="mt-2 w-full rounded-lg border border-border p-3"/></label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.featured} onChange={event => setDraft(value => ({ ...value, featured: event.target.checked }))}/>{t("Featured photo")}</label><button disabled={busy || stale || reloading} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-white gc-disabled-control">{t(busy ? "Saving…" : "Save photo details")}</button></form></dialog>
  </div>;
}
