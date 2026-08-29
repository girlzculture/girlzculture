/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import ActionToast from "@/components/ActionToast";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import {
  ABOUT_CAROUSEL_ONE_EDITORIAL_FALLBACKS,
  ABOUT_CAROUSEL_ONE_ID,
  ABOUT_CAROUSEL_TWO_ID,
  HERO_PRESENTATION_LAYOUTS,
  HOME_HERO_SECTION_ID,
  canonicalHomeHeroSection,
  findAboutCarouselSection,
  findHomeHeroSection,
  heroPresentationLayout,
  type HeroPresentationLayout,
  type ManagedContentSection,
} from "@/lib/contentSlotCore";
import type { ContentCard, ContentSection } from "@/lib/content";

type Row = Record<string, any>;
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
type WorkspaceConfig = { slug: "home" | "about-carousel-one" | "about-carousel-two"; parentSlug: "home" | "about"; sectionId: string; title: string; publicHref: string; slot: "hero" | "about-one" | "about-two" };
type ContentApiResponse = {
  error?: string;
  pages?: Row[];
  linkTargets?: Row[];
  publicationByPage?: Partial<Record<WorkspaceConfig["slug"], Row>>;
  public?: Row | null;
};
function configFor(recordId: string): WorkspaceConfig | null {
  if (recordId === "page-home--hero-promotion-carousel") return { slug: "home", parentSlug: "home", sectionId: HOME_HERO_SECTION_ID, title: "Hero Promotion Carousel", publicHref: "/", slot: "hero" };
  if (recordId === "page-about--promotional-carousel-one") return { slug: "about-carousel-one", parentSlug: "about", sectionId: ABOUT_CAROUSEL_ONE_ID, title: "Promotional Carousel One", publicHref: "/about", slot: "about-one" };
  if (recordId === "page-about--promotional-carousel-two") return { slug: "about-carousel-two", parentSlug: "about", sectionId: ABOUT_CAROUSEL_TWO_ID, title: "Promotional Carousel Two", publicHref: "/about", slot: "about-two" };
  return null;
}
function newCard(): ContentCard { return { id: crypto.randomUUID(), content_type: "image", source_kind: "upload", title: "", body: "", media_url: "", href: "", cta_label: "View", alt_text: "", status: "Draft", radius_miles: 25, priority: 50, rotation_weight: 1 }; }
function aboutSection(source: ContentSection | null, config: WorkspaceConfig): ManagedContentSection {
  return { id: config.sectionId, type: "community_carousel", title: source?.title || (config.slot === "about-one" ? "Community Spotlight" : "Our Community"), body: source?.body || "", is_visible: source?.is_visible !== false, scroll_direction: source?.scroll_direction || (config.slot === "about-one" ? "reverse" : "forward"), display_limit: source?.display_limit || 8, columns: source?.columns || 4, cards: Array.isArray(source?.cards) ? source.cards : [] };
}
function cardIssue(card: ContentCard) {
  if (card.status === "Draft") return "Draft — saved but not public";
  if (card.status === "Archived") return "Archived — not public";
  const missing = [["title", card.title], ["media", card.media_url], ["destination", card.href], ["button label", card.cta_label], ["alternative text", card.alt_text]].filter(([, value]) => !String(value || "").trim()).map(([label]) => label);
  if (missing.length) return `Not eligible — missing ${missing.join(", ")}`;
  const start = card.starts_at ? Date.parse(card.starts_at) : 0;
  const end = card.ends_at ? Date.parse(card.ends_at) : 0;
  if (start && start > Date.now()) return "Scheduled for a future date";
  if (end && end <= Date.now()) return "Expired";
  return "Eligible for publication";
}

export default function AdminPromotionSectionWorkspace({ recordId }: { recordId: string }) {
  const config = useMemo(() => configFor(recordId), [recordId]);
  const [page, setPage] = useState<Row | null>(null);
  const [section, setSection] = useState<ManagedContentSection | null>(null);
  const [layout, setLayout] = useState<HeroPresentationLayout>("promo_rail");
  const [linkTargets, setLinkTargets] = useState<Row[]>([]);
  const [publication, setPublication] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const workspaceConfig = config;
    if (!workspaceConfig) return;
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Admin sign-in required.");
    const response = await fetch("/api/admin/content", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const body = await readApiResponse(response, "Unable to load content.") as ContentApiResponse;
    if (!response.ok) throw new Error(body.error || "Unable to load content.");
    const pages = asRows(body.pages);
    const loadedPage = pages.find((item) => String(item.slug || "") === workspaceConfig.slug) || null;
    if (!loadedPage) throw new Error("This content record is unavailable.");
    let source: ContentSection | null = null;
    if (workspaceConfig.slot === "hero") {
      source = findHomeHeroSection(loadedPage.sections);
      setSection(canonicalHomeHeroSection(source));
      setLayout(heroPresentationLayout(source));
    } else {
      const slot = workspaceConfig.slot === "about-one" ? "one" : "two";
      source = findAboutCarouselSection(loadedPage.sections, slot);
      if (!source || !asRows(source.cards).length) {
        const parent = pages.find((item) => String(item.slug || "") === "about");
        const legacy = findAboutCarouselSection(parent?.sections, slot);
        if (legacy && asRows(legacy.cards).length) source = legacy;
      }
      const prepared = aboutSection(source, workspaceConfig);
      if (workspaceConfig.slot === "about-one" && !asRows(prepared.cards).length) prepared.cards = ABOUT_CAROUSEL_ONE_EDITORIAL_FALLBACKS;
      setSection(prepared);
      setLayout("community_carousel");
    }
    setPage(loadedPage);
    setLinkTargets(asRows(body.linkTargets));
    setPublication(body.publicationByPage?.[workspaceConfig.slug] || {});
  }, [config]);
  useEffect(() => { let active = true; void (async () => { try { await load(); } catch (error) { if (active) setNotice(error instanceof Error ? error.message : "Unable to load content."); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [load]);
  if (!config) return null;
  function updateCard(index: number, next: ContentCard) { setSection((current) => current ? { ...current, cards: asRows(current.cards).map((card, cardIndex) => cardIndex === index ? next : card) } : current); }
  function moveCard(index: number, direction: -1 | 1) { setSection((current) => { if (!current) return current; const cards = [...asRows(current.cards)]; const target = index + direction; if (target < 0 || target >= cards.length) return current; [cards[index], cards[target]] = [cards[target], cards[index]]; return { ...current, cards }; }); }
  async function save(action: "save_draft" | "publish" | "unpublish") {
    const workspaceConfig = config;
    if (!workspaceConfig || !page || !section) return;
    setSaving(true); setNotice("");
    try {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Your admin session has expired.");
      const payloadSection: ManagedContentSection = { ...section, id: workspaceConfig.sectionId, type: workspaceConfig.slot === "hero" ? "promo_rail" : "community_carousel", presentation_layout: workspaceConfig.slot === "hero" ? layout : undefined };
      const response = await fetch("/admin/content-sections", { method: "PUT", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ slug: workspaceConfig.slug, section: payloadSection, action, expected_updated_at: page.updated_at }) });
      const body = await readApiResponse(response, "This content section could not be saved.") as ContentApiResponse;
      if (!response.ok) throw new Error(body.error || "This content section could not be saved.");
      await load();
      const publicSection = asRows(body.public?.sections).find((candidate) => String(candidate.id || "") === workspaceConfig.sectionId);
      const publicCards = asRows(publicSection?.cards);
      setNotice(action === "publish" ? `Published and verified. ${publicCards.length} saved card${publicCards.length === 1 ? "" : "s"} reached the public snapshot.` : action === "unpublish" ? "The section is unpublished and no longer public." : "Draft saved and verified. Any previously published version remains live.");
    } catch (error) { setNotice(error instanceof Error ? `Save failed: ${error.message}` : "Save failed."); } finally { setSaving(false); }
  }
  if (loading) return <div className="min-h-screen bg-cream p-12 text-center text-plum">Loading focused content editor…</div>;
  if (!page || !section) return <div className="min-h-screen bg-cream p-8"><ActionToast message={notice || "Content record unavailable."} onDismiss={() => setNotice("")} /><Link href="/admin/content" className="text-sm font-bold text-magenta">← Back to Content Management</Link></div>;
  const cards = asRows(section.cards) as ContentCard[];
  return <main className="min-h-screen bg-cream px-4 py-6 text-ink sm:px-8"><ActionToast message={notice} onDismiss={() => setNotice("")} /><div className="mx-auto max-w-[1500px]">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link href={`/admin/content/page-${config.parentSlug}`} aria-label="Back to page sections" className="rounded-lg border border-plum/15 bg-white p-2.5 text-plum"><ArrowLeft size={18}/></Link><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-magenta">Content Management</p><h1 className="font-serif text-3xl text-plum">{config.title}</h1></div></div><Link href={config.publicHref} target="_blank" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 bg-white px-4 text-xs font-bold text-plum"><Eye size={15}/>Preview live</Link></header>
    <section className="mt-5 grid gap-3 rounded-2xl border border-plum/10 bg-white p-4 text-xs sm:grid-cols-4"><Fact label="Draft cards" value={String(cards.length)} /><Fact label="Published cards" value={String(publication.public_card_count ?? 0)} /><Fact label="Fallback positions" value={String(publication.fallback_count ?? 0)} /><Fact label="Public state" value={String(publication.state || page.status || "Draft")} /></section>
    <section className="mt-5 rounded-2xl border border-plum/10 bg-white p-5"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {config.slot === "hero" ? <label className="text-xs font-bold text-plum">Layout<select value={layout} onChange={(event) => setLayout(event.target.value as HeroPresentationLayout)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal text-ink">{HERO_PRESENTATION_LAYOUTS.map((value) => <option key={value} value={value}>{value === "promo_rail" ? "Homepage promotion rail" : value === "community_carousel" ? "Auto-scrolling community carousel" : value === "carousel" ? "Horizontal carousel" : value === "card_grid" ? "Card grid" : value === "banner" ? "Homepage promotion banner" : "Text"}</option>)}</select></label> : null}
      <Field label="Section title" value={section.title || ""} onChange={(value) => setSection((current) => current ? { ...current, title: value } : current)} />
      <label className="text-xs font-bold text-plum">Display limit<input type="number" min={1} max={20} value={section.display_limit || 8} onChange={(event) => setSection((current) => current ? { ...current, display_limit: Math.max(1, Math.min(20, Number(event.target.value || 8))) } : current)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal" /></label>
      <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-plum/15 px-3 text-xs font-bold text-plum"><input type="checkbox" checked={section.is_visible !== false} onChange={(event) => setSection((current) => current ? { ...current, is_visible: event.target.checked } : current)} className="accent-magenta"/>Visible when published</label>
      {config.slot !== "hero" || layout === "community_carousel" ? <label className="text-xs font-bold text-plum">Movement direction<select value={section.scroll_direction || "forward"} onChange={(event) => setSection((current) => current ? { ...current, scroll_direction: event.target.value as "forward" | "reverse" } : current)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"><option value="forward">Forward</option><option value="reverse">Reverse</option></select></label> : null}
      {config.slot === "hero" && layout === "card_grid" ? <label className="text-xs font-bold text-plum">Grid columns<select value={section.columns || 4} onChange={(event) => setSection((current) => current ? { ...current, columns: Number(event.target.value) } : current)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label> : null}
    </div><label className="mt-4 block text-xs font-bold text-plum">Section text<textarea rows={3} value={section.body || ""} onChange={(event) => setSection((current) => current ? { ...current, body: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-plum/15 p-3 font-normal text-ink" /></label>{config.slot === "hero" && layout === "banner" ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Banner button label" value={section.cta_label || ""} onChange={(value) => setSection((current) => current ? { ...current, cta_label: value } : current)} /><Field label="Banner destination" value={section.cta_href || ""} onChange={(value) => setSection((current) => current ? { ...current, cta_href: value } : current)} /></div> : null}</section>
    <section className="mt-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-2xl text-plum">Saved cards</h2><p className="mt-1 text-xs text-ink/55">Changing layout never deletes these cards. Draft cards stay saved without becoming public.</p></div><button type="button" onClick={() => setSection((current) => current ? { ...current, cards: [...asRows(current.cards), newCard()] } : current)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white"><Plus size={15}/>Add card</button></div>
      {cards.map((card, index) => <article key={card.id || index} className="rounded-2xl border border-plum/10 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-plum px-2 py-1 text-[9px] font-bold text-white">Position {index + 1}</span><p className={`mt-2 text-[10px] font-bold ${cardIssue(card).startsWith("Eligible") ? "gc-text-success" : "gc-text-danger"}`}>{cardIssue(card)}</p></div><div className="flex gap-1"><button type="button" disabled={index === 0} onClick={() => moveCard(index, -1)} className="rounded-lg border p-2 gc-disabled-control" aria-label="Move card up"><ArrowUp size={14}/></button><button type="button" disabled={index === cards.length - 1} onClick={() => moveCard(index, 1)} className="rounded-lg border p-2 gc-disabled-control" aria-label="Move card down"><ArrowDown size={14}/></button><button type="button" onClick={() => setSection((current) => current ? { ...current, cards: asRows(current.cards).filter((_, itemIndex) => itemIndex !== index) } : current)} className="rounded-lg border border-red-200 p-2 gc-text-danger" aria-label="Remove card"><Trash2 size={14}/></button></div></div><div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ImageUpload authScope="admin" bucket="content-media" preset="content" folder={config.slug} value={card.media_url || ""} onChange={(value) => updateCard(index, { ...card, media_url: typeof value === "string" ? value : "" })} label="Image or animated GIF" helperText="Animated GIFs remain animated; publish only after the upload URL is attached." />
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Title" value={card.title || ""} onChange={(value) => updateCard(index, { ...card, title: value })} /><Field label="Button label" value={card.cta_label || ""} onChange={(value) => updateCard(index, { ...card, cta_label: value })} /><label className="text-xs font-bold text-plum sm:col-span-2">Destination<select value={card.href || ""} onChange={(event) => { const target = linkTargets.find((item) => String(item.href || "") === event.target.value); updateCard(index, { ...card, href: event.target.value, title: card.title || String(target?.label || ""), media_url: card.media_url || String(target?.media_url || ""), source_kind: target?.type === "Salon" ? "salon" : target?.type === "Campaign" ? "campaign" : target?.type === "Blog" ? "blog" : card.source_kind, association_type: target?.type === "Salon" ? "salon" : target?.type === "Campaign" ? "campaign" : undefined, salon_id: target?.type === "Salon" ? String(target.id || "") : target?.type === "Campaign" ? String(target.salon_id || "") : undefined, campaign_id: target?.type === "Campaign" ? String(target.id || "") : undefined }); }} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"><option value="">Choose a published destination</option>{linkTargets.filter((item) => item.href).map((item) => <option key={`${item.type}-${item.id}-${item.href}`} value={item.href}>{item.type} · {item.label}</option>)}</select></label><Field label="Custom destination" value={card.href || ""} onChange={(value) => updateCard(index, { ...card, href: value, association_type: undefined, salon_id: undefined, campaign_id: undefined, source_kind: "custom" })} /><Field label="Alternative text" value={card.alt_text || ""} onChange={(value) => updateCard(index, { ...card, alt_text: value })} /><label className="text-xs font-bold text-plum">Card status<select value={card.status || "Draft"} onChange={(event) => updateCard(index, { ...card, status: event.target.value as ContentCard["status"] })} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"><option>Draft</option><option>Active</option><option>Archived</option></select></label></div>
        <label className="text-xs font-bold text-plum lg:col-span-2">Card text<textarea rows={3} value={card.body || ""} onChange={(event) => updateCard(index, { ...card, body: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/15 p-3 font-normal" /></label></div></article>)}
      {!cards.length ? <div className="rounded-2xl border border-dashed border-plum/20 bg-white p-8 text-center text-sm text-ink/55">No cards are saved. Add a card or publish the approved editorial defaults for Carousel One.</div> : null}
    </section>
    <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-plum/10 bg-white/95 p-4 shadow-xl backdrop-blur"><p className="text-[10px] leading-5 text-ink/55"><b className="block text-plum">Current layout: {layout}</b>Save draft keeps the existing public version. Publish replaces it only after database and public readback verification.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void save("save_draft")} className="min-h-10 rounded-lg border border-plum/20 px-4 text-xs font-bold text-plum gc-disabled-control">Save draft</button><button type="button" disabled={saving} onClick={() => void save("publish")} className="min-h-10 rounded-lg bg-magenta px-5 text-xs font-bold text-white gc-disabled-control">{saving ? "Saving and verifying…" : "Publish"}</button><button type="button" disabled={saving} onClick={() => void save("unpublish")} className="min-h-10 rounded-lg border border-amber/50 px-4 text-xs font-bold text-plum gc-disabled-control">Unpublish</button></div></div>
  </div></main>;
}
function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-cream/70 p-3"><b className="block text-plum">{label}</b><span className="mt-1 block text-ink/55">{value}</span></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-bold text-plum">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal text-ink" /></label>; }
