/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Plus, Trash2 } from "lucide-react";
import BaseImageUpload from "@/components/ImageUpload";
import HeroImageFraming from "@/components/admin/HeroImageFraming";
import { adminSupabase as supabase } from "@/lib/supabase";

type Row = Record<string, any>;
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const ImageUpload = (props: React.ComponentProps<typeof BaseImageUpload>) => <BaseImageUpload {...props} authScope="admin" />;
const defaultSlugs = ["home", "salon-profile", "partner", "how-it-works", "about", "press", "testimonials", "help", "safety", "terms", "privacy", "accessibility"];
const hiddenSlugs = new Set(["careers", "cancellation-policy"]);
const labelSlots: Record<string, Array<[string, string]>> = {
  home: [["social_proof_heading", "Hero social proof heading"], ["social_proof_subheading", "Hero social proof detail"], ["social_proof_note", "Hero social proof note"], ["salons_near_you_subheading", "Salons Near You subheading"], ["featured_salons_subheading", "Featured Salons subheading"], ["trending_now_subheading", "Trending Now subheading"], ["trending_picks_subheading", "Trending Picks subheading"]],
  "salon-profile": [["trust_label_1", "Salon trust label 1"], ["trust_label_2", "Salon trust label 2"], ["trust_label_3", "Salon trust label 3"]],
  partner: [["stat_label_1", "Partner photo label 1"], ["stat_label_2", "Partner photo label 2"], ["stat_label_3", "Partner photo label 3"]],
};

export default function AdminContentManager() {
  const [tab, setTab] = useState<"pages" | "blog" | "styles">("pages");
  const [pages, setPages] = useState<Row[]>([]);
  const [posts, setPosts] = useState<Row[]>([]);
  const [page, setPage] = useState<Row | null>(null);
  const [post, setPost] = useState<Row | null>(null);
  const [masterStyles, setMasterStyles] = useState<Row[]>([]);
  const [masterStyle, setMasterStyle] = useState<Row | null>(null);
  const [serviceCategories, setServiceCategories] = useState<Row[]>([]);
  const [linkTargets, setLinkTargets] = useState<Row[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Your admin session has expired. Please sign in again.");
    return { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  }

  async function loadContent(selectFirst = true) {
    try {
      const response = await fetch("/api/admin/content", { headers: await authHeaders(), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load content");
      const loadedPages = asRows(body.pages);
      const loadedPosts = asRows(body.posts);
      const loadedStyles = asRows(body.masterStyles);
      const loadedCategories = asRows(body.serviceCategories);
      const loadedTargets = asRows(body.linkTargets);
      setPages(loadedPages);
      setPosts(loadedPosts);
      setMasterStyles(loadedStyles);
      setServiceCategories(loadedCategories);
      setLinkTargets(loadedTargets);
      if (selectFirst) {
        const visiblePages = loadedPages.filter((item: Row) => !hiddenSlugs.has(item.slug));
        setPage(visiblePages[0] || null);
        setPost(loadedPosts[0] || null);
        setMasterStyle(loadedStyles[0] || null);
      }
      return { pages: loadedPages, posts: loadedPosts, masterStyles: loadedStyles, serviceCategories: loadedCategories, linkTargets: loadedTargets };
    } catch (error) {
      console.error("Content Management load error", error);
      setNotice(error instanceof Error ? error.message : "Unable to load content");
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Your admin session has expired. Please sign in again.");
        const response = await fetch("/api/admin/content", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load content");
        if (!active) return;
        const loadedPages = asRows(body.pages); const loadedPosts = asRows(body.posts); const loadedStyles = asRows(body.masterStyles); const loadedCategories = asRows(body.serviceCategories); const loadedTargets = asRows(body.linkTargets);
        setPages(loadedPages); setPosts(loadedPosts); setMasterStyles(loadedStyles); setServiceCategories(loadedCategories); setLinkTargets(loadedTargets);
        const visiblePages = loadedPages.filter((item: Row) => !hiddenSlugs.has(item.slug));
        setPage(visiblePages[0] || null); setPost(loadedPosts[0] || null); setMasterStyle(loadedStyles[0] || null);
      } catch (error) {
        console.error("Content Management load error", error);
        if (active) setNotice(error instanceof Error ? error.message : "Unable to load content");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  async function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!page) return;
    const form = new FormData(event.currentTarget);
    const sections = asRows(page.sections).map((section: Row, index: number) => ({
      ...section,
      title: String(form.get(`section_title_${index}`) || ""),
      body: String(form.get(`section_body_${index}`) || ""),
      cta_label: String(form.get(`section_cta_label_${index}`) || section.cta_label || ""),
      cta_href: String(form.get(`section_cta_href_${index}`) || section.cta_href || ""),
    }));
    const labels = Object.fromEntries((labelSlots[page.slug] || []).map(([key]) => [key, String(form.get(`label_${key}`) || "").trim()]));
    const payload = {
      ...page,
      title: form.get("title"), eyebrow: form.get("eyebrow"), hero_title: form.get("hero_title"),
      hero_subtitle: form.get("hero_subtitle"), seo_title: form.get("seo_title"),
      seo_description: form.get("seo_description"), status: form.get("status"), sections, labels,
      hero_position_x: Number(page.hero_position_x ?? 50), hero_position_y: Number(page.hero_position_y ?? 50), hero_zoom: Number(page.hero_zoom ?? 1),
      updated_at: new Date().toISOString(),
    };
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/admin/content", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ type: "page", payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Page save failed");
      const data = body.data;
      const reloaded = await loadContent(false);
      const persisted = reloaded.pages.find((row) => row.slug === data.slug);
      if (!persisted || persisted.updated_at !== data.updated_at) throw new Error("The page was sent but could not be verified after saving.");
    setPage(data);
    setPages(rows => rows.some(row => row.slug === data.slug) ? rows.map(row => row.slug === data.slug ? data : row) : [...rows, data]);
      setNotice("Page saved, verified in Supabase, and published content is updated.");
    } catch (error) {
      console.error("Content Management page save error", { slug: page.slug, error });
      setNotice(error instanceof Error ? `Save failed: ${error.message}` : "Page save failed");
    } finally { setSaving(false); }
  }

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      ...post,
      slug: form.get("slug"), title: form.get("title"), excerpt: form.get("excerpt"),
      category: form.get("category"), content: form.get("content"), status: form.get("status"),
      featured: form.get("featured") === "on", published_at: post.published_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/admin/content", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ type: "post", payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Post save failed");
      const data = body.data;
      const reloaded = await loadContent(false);
      const persisted = reloaded.posts.find((row) => row.id === data.id);
      if (!persisted || persisted.updated_at !== data.updated_at) throw new Error("The post was sent but could not be verified after saving.");
    setPost(data);
    setPosts(rows => rows.some(row => row.id === data.id) ? rows.map(row => row.id === data.id ? data : row) : [data, ...rows]);
      setNotice("Blog post saved and verified in Supabase.");
    } catch (error) {
      console.error("Content Management blog save error", { slug: post.slug, error });
      setNotice(error instanceof Error ? `Save failed: ${error.message}` : "Post save failed");
    } finally { setSaving(false); }
  }

  async function removePost() {
    if (!post?.id || !confirm("Delete this blog post?")) return;
    try {
      const response = await fetch("/api/admin/content", { method: "DELETE", headers: await authHeaders(), body: JSON.stringify({ id: post.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Delete failed");
      setPosts(rows => rows.filter(row => row.id !== post.id));
      setPost(null);
      setNotice("Blog post deleted.");
    } catch (error) {
      console.error("Content Management delete error", error);
      setNotice(error instanceof Error ? error.message : "Delete failed");
    }
  }

  async function saveMasterStyle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!masterStyle) return;
    const form = new FormData(event.currentTarget);
    const payload = { ...masterStyle, name: form.get("name"), category: form.get("category"), category_id: form.get("category_id"), sort_order: Number(form.get("sort_order") || 0), is_active: form.get("is_active") === "on" };
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/admin/content", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ type: "master_style", payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Style save failed");
      const data = body.data;
      const reloaded = await loadContent(false);
      const persisted = reloaded.masterStyles.find((row) => row.id === data.id);
      if (!persisted) throw new Error("The style could not be verified after saving.");
      setMasterStyle(persisted);
      setMasterStyles((rows) => rows.some((row) => row.id === data.id) ? rows.map((row) => row.id === data.id ? persisted : row) : [...rows, persisted]);
      setNotice("Managed service saved and available to salon owners.");
    } catch (error) {
      console.error("Master style save error", error);
      setNotice(error instanceof Error ? error.message : "Service save failed");
    } finally { setSaving(false); }
  }

  function createNew() {
    if (tab === "styles") { setMasterStyle({ name: "", category: "Braids", category_id: serviceCategories[0]?.id || "", sort_order: masterStyles.length * 10 + 10, is_active: true }); return; }
    if (tab === "blog") {
      setPost({ slug: "new-post", title: "New Blog Post", excerpt: "", content: "", category: "Braided Styles", status: "Draft", featured: false });
      return;
    }
    const slug = prompt("Page slug (example: faq)")?.trim().toLowerCase();
    if (slug) setPage({ slug, title: slug.replaceAll("-", " "), hero_title: "New page", sections: [], status: "Draft" });
  }

  const slugs = [...new Set([...defaultSlugs, ...pages.map(item => item.slug)])].filter(slug => !hiddenSlugs.has(slug));

  if (loading) return <div className="rounded-xl border border-plum/10 bg-white p-8 text-sm text-ink/60">Loading editable content…</div>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-plum/10 bg-white p-1">
          {(["pages", "blog", "styles"] as const).map(value => <button key={value} onClick={() => setTab(value)} className={`rounded-md px-5 py-2 text-xs font-bold ${tab === value ? "bg-magenta text-white" : ""}`}>{value === "pages" ? "Pages" : value === "blog" ? "Blog" : "Service Catalog"}</button>)}
        </div>
        <button onClick={createNew} className="flex items-center gap-2 rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white"><Plus size={16} />Create {tab === "pages" ? "Page" : tab === "blog" ? "Post" : "Service"}</button>
      </div>
      {notice ? <p className="mb-4 rounded-lg bg-blush/50 p-3 text-sm text-plum">{notice}</p> : null}
      {saving ? <p className="mb-4 text-xs font-bold text-magenta">Saving and verifying in Supabase…</p> : null}
      {tab === "pages" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[250px_1fr]">
          <aside className="rounded-xl border border-plum/10 bg-white p-3">
            <h2 className="px-2 py-2 font-serif text-xl text-plum">Public Pages</h2>
            {slugs.map(slug => <button key={slug} onClick={() => setPage(pages.find(item => item.slug === slug) || { slug, title: slug, hero_title: slug, sections: [], status: "Draft" })} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${page?.slug === slug ? "bg-blush text-magenta" : ""}`}><FileText size={15} />{slug}</button>)}
          </aside>
          {page ? <PageEditor key={page.slug} page={page} setPage={setPage} save={savePage} linkTargets={linkTargets} /> : null}
        </div>
      ) : tab === "blog" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border border-plum/10 bg-white p-3">{posts.map(item => <button key={item.id} onClick={() => setPost(item)} className={`mb-1 w-full rounded-lg p-3 text-left ${post?.id === item.id ? "bg-blush" : ""}`}><b className="block text-xs text-plum">{item.title}</b><small>{item.status} · {item.category}</small></button>)}</aside>
          {post ? <PostEditor key={post.id || "new"} post={post} setPost={setPost} save={savePost} remove={removePost} /> : null}
        </div>
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[280px_1fr]">
          <aside className="max-h-[700px] overflow-y-auto rounded-xl border border-plum/10 bg-white p-3">{masterStyles.map((item) => <button key={item.id} onClick={() => setMasterStyle(item)} className={`mb-1 w-full rounded-lg p-3 text-left ${masterStyle?.id === item.id ? "bg-blush" : ""}`}><b className="block text-xs text-plum">{item.name}</b><small>{item.service_category?.name || "Uncategorized"} · {item.category} · {item.is_active ? "Active" : "Hidden"}</small></button>)}</aside>
          {masterStyle ? <form key={masterStyle.id || "new-style"} onSubmit={saveMasterStyle} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5"><h2 className="font-serif text-2xl text-plum">Managed Service</h2><p className="mt-1 text-xs leading-5 text-ink/55">Every service belongs to a top-level category. The service group keeps related offerings organized inside that category.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Service name" name="name" value={masterStyle.name} /><label className="text-xs font-bold">Top-level category<select required name="category_id" defaultValue={masterStyle.category_id || serviceCategories[0]?.id || ""} className="mt-1 w-full rounded-lg border p-3"><option value="">Choose category</option>{serviceCategories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Field label="Service group" name="category" value={masterStyle.category} /><Field label="Sort order" name="sort_order" value={String(masterStyle.sort_order || 0)} /><label className="flex items-center gap-2 self-end rounded-lg border border-plum/10 p-3 text-xs font-bold"><input type="checkbox" name="is_active" defaultChecked={masterStyle.is_active !== false} className="accent-magenta" />Available to salon owners</label></div><button disabled={saving} className="mt-6 rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white disabled:opacity-60">Save Managed Service</button></form> : null}
        </div>
      )}
    </div>
  );
}

function PageEditor({ page, setPage, save, linkTargets }: { page: Row; setPage: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void; linkTargets: Row[] }) {
  const slots = labelSlots[page.slug] || [];
  return <form onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5">
    <div className="grid gap-4 lg:grid-cols-2">
      <Field label="Page title" name="title" value={page.title} />
      <Field label="Eyebrow" name="eyebrow" value={page.eyebrow} />
      <div className="lg:col-span-2"><Field label="Hero heading" name="hero_title" value={page.hero_title} /></div>
      <Area label="Hero description" name="hero_subtitle" value={page.hero_subtitle} rows={3} />
      <ImageUpload bucket="content-media" value={page.hero_image_url} onChange={value => setPage(row => ({ ...row, hero_image_url: value }))} label="Hero image" folder={page.slug} />
      <ImageUpload bucket="content-media" value={page.background_image_url} onChange={value => setPage(row => ({ ...row, background_image_url: value }))} label="Background image" folder={page.slug} />
    </div>
    <HeroImageFraming imageUrl={page.hero_image_url} positionX={Number(page.hero_position_x ?? 50)} positionY={Number(page.hero_position_y ?? 50)} zoom={Number(page.hero_zoom ?? 1)} onChange={({ positionX, positionY, zoom }) => setPage(row => ({ ...row, hero_position_x: positionX, hero_position_y: positionY, hero_zoom: zoom }))} />
    {slots.length ? <>
      <h2 className="mt-6 font-serif text-2xl text-plum">Optional page labels</h2>
      <p className="mt-1 text-xs text-ink/55">These labels remain hidden until you add text. Clear a field to remove it from the public page.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{slots.map(([key, label]) => <Field key={key} label={label} name={`label_${key}`} value={page.labels?.[key]} />)}</div>
    </> : null}
    <h2 className="mt-6 font-serif text-2xl text-plum">Sections</h2>
    <div className="mt-3 space-y-3">{asRows(page.sections).map((section: Row, index: number) => <SectionEditor key={section.id || index} section={section} index={index} linkTargets={linkTargets} update={(next) => setPage(row => ({ ...row, sections: asRows(row?.sections).map((item: Row, itemIndex: number) => itemIndex === index ? next : item) }))} remove={() => setPage(row => ({ ...row, sections: asRows(row?.sections).filter((_: Row, itemIndex: number) => itemIndex !== index) }))} />)}</div>
    <button type="button" onClick={() => setPage(row => ({ ...row, sections: [...asRows(row?.sections), { id: crypto.randomUUID(), type: "card_grid", title: "New Section", body: "", is_visible: true, columns: 4, cards: [] }] }))} className="mt-3 text-xs font-bold text-magenta">+ Add section</button>
    <div className="mt-6 grid gap-3 sm:grid-cols-2"><Field label="SEO title" name="seo_title" value={page.seo_title} /><Field label="SEO description" name="seo_description" value={page.seo_description} /><label className="text-xs font-bold">Status<select name="status" defaultValue={page.status || "Draft"} className="mt-1 w-full rounded-lg border p-3 font-normal"><option>Draft</option><option>Published</option></select></label></div>
    <button className="mt-6 rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white">Save Page</button>
  </form>;
}

function SectionEditor({ section, index, linkTargets, update, remove }: { section: Row; index: number; linkTargets: Row[]; update: (section: Row) => void; remove: () => void }) {
  const type = String(section.type || "text");
  const cards = asRows(section.cards);
  const maximum = type === "community_carousel" ? 20 : 12;
  function resizeCards(count: number) {
    const next = [...cards];
    while (next.length < count) next.push({ id: crypto.randomUUID(), content_type: "image", title: "", body: "", media_url: "", href: "" });
    update({ ...section, cards: next.slice(0, count) });
  }
  function updateCard(cardIndex: number, value: Row) { update({ ...section, cards: cards.map((card, itemIndex) => itemIndex === cardIndex ? value : card) }); }
  function moveCard(cardIndex: number, direction: -1 | 1) {
    const nextIndex = cardIndex + direction;
    if (nextIndex < 0 || nextIndex >= cards.length) return;
    const next = [...cards]; [next[cardIndex], next[nextIndex]] = [next[nextIndex], next[cardIndex]];
    update({ ...section, cards: next });
  }
  return <div className="rounded-lg border border-plum/10 bg-blush/25 p-4">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Layout<select value={type} onChange={(event) => update({ ...section, type: event.target.value, cards: ["card_grid", "carousel", "community_carousel"].includes(event.target.value) ? cards : [] })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option value="text">Text</option><option value="card_grid">Card grid</option><option value="carousel">Horizontal carousel</option><option value="community_carousel">Auto-scrolling community carousel</option><option value="banner">Banner</option></select></label>
        {["card_grid", "carousel", "community_carousel"].includes(type) ? <label className="text-xs font-bold">Number of cards<input type="number" min="1" max={maximum} value={cards.length || 1} onChange={(event) => resizeCards(Math.max(1, Math.min(maximum, Number(event.target.value) || 1)))} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal" /></label> : null}
      </div>
      <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold"><input type="checkbox" checked={section.is_visible !== false} onChange={(event) => update({ ...section, is_visible: event.target.checked })} className="accent-magenta" />Published on page</label>
      <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-xs font-bold text-red-600"><Trash2 size={14}/>Remove section</button>
    </div>
    <Field label="Section heading" name={`section_title_${index}`} value={section.title} />
    <Area label="Section text" name={`section_body_${index}`} value={section.body} rows={4} />
    {type === "banner" ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Button label" name={`section_cta_label_${index}`} value={section.cta_label} /><Field label="Button destination" name={`section_cta_href_${index}`} value={section.cta_href} /></div> : null}
    {type === "card_grid" ? <label className="mt-3 block text-xs font-bold">Columns<select value={Number(section.columns || 4)} onChange={(event) => update({ ...section, columns: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label> : null}
    {cards.length ? <div className="mt-4 grid gap-4 xl:grid-cols-2">{cards.map((card, cardIndex) => <article key={card.id || cardIndex} className="rounded-xl border border-plum/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><b className="font-serif text-lg text-plum">Card {cardIndex + 1}</b><div className="flex gap-1"><button type="button" aria-label="Move card up" onClick={() => moveCard(cardIndex, -1)} disabled={cardIndex === 0} className="rounded-md border p-2 text-plum disabled:opacity-30"><ArrowUp size={14}/></button><button type="button" aria-label="Move card down" onClick={() => moveCard(cardIndex, 1)} disabled={cardIndex === cards.length - 1} className="rounded-md border p-2 text-plum disabled:opacity-30"><ArrowDown size={14}/></button></div></div>
      <label className="mt-3 block text-xs font-bold">Card type<select value={card.content_type || "image"} onChange={(event) => updateCard(cardIndex, { ...card, content_type: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="image">Image</option><option value="video">Video</option><option value="link">Link</option></select></label>
      {card.content_type === "video" ? <label className="mt-3 block text-xs font-bold">Video URL<input value={card.media_url || ""} onChange={(event) => updateCard(cardIndex, { ...card, media_url: event.target.value })} placeholder="https://â€¦/video.mp4" className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label> : <ImageUpload bucket="content-media" value={card.media_url} onChange={(value) => updateCard(cardIndex, { ...card, media_url: typeof value === "string" ? value : "" })} label={card.content_type === "link" ? "Link card image" : "Card image"} folder={`${section.id || "section"}/card-${cardIndex + 1}`} />}
      <label className="mt-3 block text-xs font-bold">Card title<input value={card.title || ""} onChange={(event) => updateCard(cardIndex, { ...card, title: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
      <label className="mt-3 block text-xs font-bold">Card text<textarea rows={3} value={card.body || ""} onChange={(event) => updateCard(cardIndex, { ...card, body: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
      <label className="mt-3 block text-xs font-bold">Destination<select value={linkTargets.some((target) => target.href === card.href) ? card.href : ""} onChange={(event) => updateCard(cardIndex, { ...card, href: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="">No saved destination / custom URL</option>{linkTargets.map((target) => <option key={`${target.type}-${target.href}`} value={target.href}>{target.type}: {target.label}</option>)}</select></label>
      <label className="mt-3 block text-xs font-bold">Custom destination<input value={card.href || ""} onChange={(event) => updateCard(cardIndex, { ...card, href: event.target.value })} placeholder="/salon/example or https://â€¦" className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
    </article>)}</div> : null}
  </div>;
}

function PostEditor({ post, setPost, save, remove }: { post: Row; setPost: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void; remove: () => void }) {
  return <form onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Title" name="title" value={post.title} /><Field label="Slug" name="slug" value={post.slug} /><Field label="Category" name="category" value={post.category} /><label className="text-xs font-bold">Status<select name="status" defaultValue={post.status} className="mt-1 w-full rounded-lg border p-3"><option>Draft</option><option>Published</option></select></label></div><Area label="Excerpt" name="excerpt" value={post.excerpt} rows={3} /><ImageUpload bucket="content-media" value={post.cover_image_url} onChange={value => setPost(row => ({ ...row, cover_image_url: value }))} label="Cover image" folder="blog" /><Area label="Article content · use ### for headings" name="content" value={post.content} rows={16} /><label className="mt-3 flex gap-2 text-xs"><input type="checkbox" name="featured" defaultChecked={post.featured} />Feature this post</label><div className="mt-5 flex gap-3"><button className="rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white">Save Post</button>{post.id ? <button type="button" onClick={remove} className="flex items-center gap-2 rounded-lg border border-red-300 px-5 py-3 text-xs text-red-600"><Trash2 size={15} />Delete</button> : null}</div></form>;
}

function Field({ label, name, value }: { label: string; name: string; value?: string }) { return <label className="block text-xs font-bold">{label}<input name={name} defaultValue={value || ""} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>; }
function Area({ label, name, value, rows }: { label: string; name: string; value?: string; rows: number }) { return <label className="mt-4 block text-xs font-bold">{label}<textarea name={name} defaultValue={value || ""} rows={rows} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal leading-6" /></label>; }
