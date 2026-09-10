"use client";

import { useState, useEffect, useRef, useId, type ReactNode } from "react";
import ImageUpload from "@/components/ImageUpload";
import BusinessSignupLanding, { businessPhotoAsset } from "@/components/business/BusinessSignupLanding";
import BusinessPhoto from "@/components/business/BusinessPhoto";
import { adminSupabase, getValidSessionForScope } from "@/lib/supabase";
import { directBusinessHeroVideoUpload } from "@/lib/mediaUploadClient";
import { BUSINESS_SIGNUP_LIVE_APPLICATIONS, BUSINESS_SIGNUP_TRUST_ICONS, validateBusinessSignupContent, type BusinessSignupContent, type BusinessSignupImage } from "@/lib/businessSignupContent";
import "@/app/business/business-onboarding.css";

const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-plum/20 bg-white px-3 py-2 font-normal text-ink";
function Text({ label, value, change, max = 600, multiline = false }: { label: string; value: string; change: (value: string) => void; max?: number; multiline?: boolean }) {
  const id = useId();
  return <div><label htmlFor={id} className="block text-xs font-bold text-plum">{label}</label>{multiline ? <textarea id={id} className={inputClass} value={value} maxLength={max} onChange={event => change(event.target.value)} rows={3} /> : <input id={id} className={inputClass} value={value} maxLength={max} onChange={event => change(event.target.value)} />}</div>;
}
function Select<T extends string>({ label, value, options, change }: { label: string; value: T; options: readonly T[]; change: (value: T) => void }) {
  const id = useId();
  return <div><label htmlFor={id} className="block text-xs font-bold text-plum">{label}</label><select id={id} className={inputClass} value={value} onChange={event => change(event.target.value as T)}>{options.map(option => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></div>;
}
function Visible({ label, value, change }: { label: string; value: boolean; change: (value: boolean) => void }) {
  return <label className="flex min-h-11 items-center gap-3 text-xs font-bold text-plum"><input type="checkbox" checked={value} onChange={event => change(event.target.checked)} />{label}</label>;
}
function NumberField({ label, value, change }: { label: string; value: number; change: (value: number) => void }) {
  return <label className="block text-xs font-bold text-plum">{label}<input className={inputClass} type="number" min={0} max={100} step={1} value={value} onChange={event => change(Math.min(100, Math.max(0, Number(event.target.value))))} /></label>;
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="min-w-0 space-y-4 rounded-xl border border-plum/15 bg-white p-5"><legend className="px-2 font-serif text-xl text-plum">{title}</legend>{children}</fieldset>;
}
function ImageFields({ label, value, change }: { label: string; value: BusinessSignupImage; change: (value: BusinessSignupImage) => void }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <div className="space-y-3">
    <ImageUpload authScope="admin" bucket="content-media" preset="content" folder="business-signup" label={`${label} upload`} value={value.src} onChange={src => { if (mounted.current) change({ ...value, src: typeof src === "string" ? src : "" }); }} />
    <Text label={`${label} existing asset URL`} value={value.src} max={1200} change={src => change({ ...value, src })} />
    <Text label={`${label} alt text`} value={value.alt} max={240} change={alt => change({ ...value, alt })} />
    <div className="grid gap-3 sm:grid-cols-3">
      <NumberField label={`${label} focal X`} value={value.focalX} change={focalX => change({ ...value, focalX })} />
      <NumberField label={`${label} focal Y`} value={value.focalY} change={focalY => change({ ...value, focalY })} />
      <Select label={`${label} fit`} value={value.fit} options={["cover", "contain"]} change={fit => change({ ...value, fit })} />
    </div>
    {value.src ? <div className="h-44 max-w-xl overflow-hidden rounded-lg bg-cream" aria-label={`${label} crop preview`}><BusinessPhoto photo={businessPhotoAsset(value)} /></div> : null}
  </div>;
}

function VideoUpload({ value, change }: { value: string; change: (url: string) => void }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<{ source: File; uploadId?: string } | null>(null);
  async function upload(source: File, resumeUploadId?: string) {
    setBusy(true); setError(""); setProgress(0);
    try {
      const session = await getValidSessionForScope("admin");
      if (!session) throw new Error("Sign in to Platform Admin before uploading.");
      const result = await directBusinessHeroVideoUpload({ client: adminSupabase, session, source, resumeUploadId, onFinalizePending: uploadId => setPending({ source, uploadId: uploadId || undefined }), onProgress: percent => setProgress(percent) });
      if (mounted.current) { change(result.url); setPending(null); }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Video upload failed. Please retry.");
      setPending(current => current || { source, uploadId: resumeUploadId });
    } finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <label className="block text-xs font-bold text-plum">Hero MP4 upload<input type="file" accept="video/mp4,.mp4" disabled={busy} className={inputClass} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label>
    <p className="text-xs text-text-secondary">H.264 MP4, up to 12 MB and 2 minutes. Upload a still poster below. Publication uses the existing page workflow.</p>
    {busy ? <p role="status">Uploading video: {Math.round(progress)}%</p> : null}
    {error ? <p role="alert" className="text-sm gc-text-danger">{error}</p> : null}
    {pending && !busy ? <button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => void upload(pending.source, pending.uploadId)}>Retry video upload</button> : null}
    <Text label="Hero video existing asset URL" value={value} max={1200} change={change} />
    {value ? <button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => change("")}>Remove hero video</button> : null}
  </div>;
}

export default function BusinessSignupContentEditor({ content, change }: { content: BusinessSignupContent; change: (content: BusinessSignupContent) => void }) {
  const [preview, setPreview] = useState(false);
  let previewContent: BusinessSignupContent | null = null;
  let previewError = "";
  if (preview) {
    try { previewContent = validateBusinessSignupContent(content); }
    catch (error) { previewError = error instanceof Error ? error.message : "Complete the draft fields to preview."; }
  }
  const { header, hero } = content;
  const updateHeader = (patch: Partial<typeof header>) => change({ ...content, header: { ...header, ...patch } });
  const updateHero = (patch: Partial<typeof hero>) => change({ ...content, hero: { ...hero, ...patch } });
  return <div className="space-y-5" data-testid="business-signup-content-editor">
    <p className="text-sm text-text-secondary">Edit this page within its approved layout. Changes stay in the draft until you publish. Media URLs must belong to this site or its Content Management storage.</p>
    <Group title="A. Header">
      <Visible label="Show logo" value={header.logo.visible} change={visible => updateHeader({ logo: { ...header.logo, visible } })} />
      <Select label="Logo mode" value={header.logo.mode} options={["text", "image"]} change={mode => updateHeader({ logo: { ...header.logo, mode } })} />
      <Text label="Logo text" value={header.logo.text} max={80} change={text => updateHeader({ logo: { ...header.logo, text } })} />
      <ImageFields label="Logo image" value={header.logo.image} change={image => updateHeader({ logo: { ...header.logo, image } })} />
      <div className="grid gap-3 sm:grid-cols-2"><Select label="Logo size" value={header.logo.size} options={["small", "standard", "large"]} change={size => updateHeader({ logo: { ...header.logo, size } })} /><Select label="Logo alignment" value={header.logo.alignment} options={["left", "center"]} change={alignment => updateHeader({ logo: { ...header.logo, alignment } })} /></div>
      <Visible label="Show login area" value={header.login.visible} change={visible => updateHeader({ login: { ...header.login, visible } })} />
      <Text label="Login helper text" value={header.login.helperText} max={160} change={helperText => updateHeader({ login: { ...header.login, helperText } })} />
      <Text label="Login button label" value={header.login.label} max={60} change={label => updateHeader({ login: { ...header.login, label } })} />
      <Text label="Login internal destination" value={header.login.href} max={1200} change={href => updateHeader({ login: { ...header.login, href } })} />
    </Group>
    <Group title="B. Hero">
      <Visible label="Show hero" value={hero.visible} change={visible => updateHero({ visible })} />
      <Text label="Hero heading" value={hero.heading} max={160} change={heading => updateHero({ heading })} />
      <Text label="Hero supporting text" value={hero.supportingText} change={supportingText => updateHero({ supportingText })} multiline />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Hero accent" value={hero.accent} options={["none", "teal"]} change={accent => updateHero({ accent })} />
        <Select label="Hero overlay" value={hero.overlay} options={["light", "medium", "strong"]} change={overlay => updateHero({ overlay })} />
        <Select label="Hero height" value={hero.height} options={["compact", "standard", "tall"]} change={height => updateHero({ height })} />
        <Select label="Hero alignment" value={hero.alignment} options={["left", "center"]} change={alignment => updateHero({ alignment })} />
        <Select label="Hero media type" value={hero.media.type} options={["image", "gif", "video", "none"]} change={type => updateHero({ media: { ...hero.media, type, src: type === hero.media.type || (["image", "gif"].includes(type) && ["image", "gif"].includes(hero.media.type)) ? hero.media.src : "" } })} />
      </div>
      {hero.media.type === "video" ? <><VideoUpload value={hero.media.src} change={src => updateHero({ media: { ...hero.media, src } })} /><NumberField label="Video focal X" value={hero.media.focalX} change={focalX => updateHero({ media: { ...hero.media, focalX } })} /><NumberField label="Video focal Y" value={hero.media.focalY} change={focalY => updateHero({ media: { ...hero.media, focalY } })} /></> : hero.media.type !== "none" ? <ImageFields key={hero.media.type} label="Hero media" value={hero.media} change={image => updateHero({ media: { ...hero.media, ...image } })} /> : null}
      <ImageFields label="Hero poster and fallback" value={hero.media.poster} change={poster => updateHero({ media: { ...hero.media, poster } })} />
    </Group>
    <Group title="C. Business Selector"><Text label="Selector heading" value={content.selector.heading} max={160} change={heading => change({ ...content, selector: { ...content.selector, heading } })} /><Text label="Selector supporting text" value={content.selector.supportingText} max={500} change={supportingText => change({ ...content, selector: { ...content.selector, supportingText } })} /></Group>
    <Group title="D. Business Categories">
      {content.categories.map(category => {
        const update = (patch: Partial<typeof category>) => change({ ...content, categories: content.categories.map(item => item.id === category.id ? { ...category, ...patch } : item) });
        return <details key={category.id} className="rounded-lg border border-plum/15 p-4"><summary className="cursor-pointer font-bold text-plum">{category.name || category.id}</summary><div className="mt-4 space-y-4">
          <p className="text-xs text-text-secondary">Stable identity: {category.id}</p>
          <Text label={`${category.id} display name`} value={category.name} max={100} change={name => update({ name })} />
          <Visible label={`${category.id} visible`} value={category.visible} change={visible => update({ visible })} />
          <NumberField label={`${category.id} order`} value={category.order} change={order => update({ order })} />
          <Select label={`${category.id} destination mode`} value={category.mode} options={["waitlist", "live_application"]} change={mode => update({ mode })} />
          {!BUSINESS_SIGNUP_LIVE_APPLICATIONS[category.id] ? <p className="text-xs text-text-secondary">Live application can be published after this category’s dedicated application is registered. It currently opens the waitlist.</p> : null}
          <ImageFields label={`${category.id} card image`} value={category.image} change={image => update({ image })} />
          <Text label={`${category.id} waitlist heading override`} value={category.waitlist?.heading ?? ""} max={160} change={heading => update({ waitlist: { ...category.waitlist, heading: heading || undefined } })} />
          <Text label={`${category.id} waitlist description override`} value={category.waitlist?.description ?? ""} max={1200} change={description => update({ waitlist: { ...category.waitlist, description: description || undefined } })} multiline />
          <Visible label={`${category.id} use a separate waitlist image`} value={Boolean(category.waitlist?.image)} change={enabled => update({ waitlist: { ...category.waitlist, image: enabled ? { ...category.image } : undefined } })} />
          {category.waitlist?.image ? <ImageFields label={`${category.id} waitlist image`} value={category.waitlist.image} change={image => update({ waitlist: { ...category.waitlist, image } })} /> : null}
        </div></details>;
      })}
    </Group>
    <Group title="E. Waitlist"><p className="text-xs text-text-secondary">Use {"{businessType}"} to insert the selected business name.</p>{([
      ["eyebrow", "Waitlist eyebrow", 80], ["heading", "Waitlist heading template", 160], ["description", "Waitlist description", 1200], ["submitLabel", "Waitlist submit label", 80], ["successHeading", "Waitlist success heading", 160], ["successDescription", "Waitlist success description", 1200], ["privacyText", "Waitlist privacy text", 800], ["supportText", "Waitlist support text", 800],
    ] as const).map(([key, label, max]) => <Text key={key} label={label} value={content.waitlist[key]} max={max} multiline={max > 600} change={value => change({ ...content, waitlist: { ...content.waitlist, [key]: value } })} />)}</Group>
    <Group title="F. Trust Section">{content.trust.map(block => {
      const update = (patch: Partial<typeof block>) => change({ ...content, trust: content.trust.map(item => item.id === block.id ? { ...block, ...patch } : item) });
      return <Group key={block.id} title={block.heading || block.id}><Visible label={`${block.id} visible`} value={block.visible} change={visible => update({ visible })} /><Select label={`${block.id} icon`} value={block.icon} options={BUSINESS_SIGNUP_TRUST_ICONS} change={icon => update({ icon })} /><Text label={`${block.id} heading`} value={block.heading} max={120} change={heading => update({ heading })} /><Text label={`${block.id} description`} value={block.description} max={500} change={description => update({ description })} /><NumberField label={`${block.id} order`} value={block.order} change={order => update({ order })} /></Group>;
    })}</Group>
    <button type="button" onClick={() => setPreview(!preview)} className="min-h-11 rounded-lg border border-plum/20 bg-white px-5 font-bold text-plum">{preview ? "Close draft preview" : "Preview draft"}</button>
    {preview ? <section aria-label="Unpublished business signup preview" className="overflow-hidden rounded-xl border border-plum/20"><p className="bg-cream p-3 text-sm text-plum">Draft preview — this does not change the public page.</p>{previewContent ? <BusinessSignupLanding content={previewContent} /> : <p role="alert" className="p-4 gc-text-danger">{previewError}</p>}</section> : null}
  </div>;
}
