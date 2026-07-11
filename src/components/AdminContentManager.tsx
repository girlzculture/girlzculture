/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import { supabase } from "@/lib/supabase";

type Row = Record<string, any>;
const defaultSlugs = ["home", "about", "press", "testimonials", "help", "safety", "terms", "privacy", "accessibility"];
const hiddenSlugs = new Set(["careers", "cancellation-policy"]);

export default function AdminContentManager() {
  const [tab, setTab] = useState<"pages" | "blog">("pages");
  const [pages, setPages] = useState<Row[]>([]);
  const [posts, setPosts] = useState<Row[]>([]);
  const [page, setPage] = useState<Row | null>(null);
  const [post, setPost] = useState<Row | null>(null);
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
      setPages(body.pages || []);
      setPosts(body.posts || []);
      if (selectFirst) {
        const visiblePages = (body.pages || []).filter((item: Row) => !hiddenSlugs.has(item.slug));
        setPage(visiblePages[0] || null);
        setPost(body.posts?.[0] || null);
      }
      return body as { pages: Row[]; posts: Row[] };
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
        setPages(body.pages || []); setPosts(body.posts || []);
        const visiblePages = (body.pages || []).filter((item: Row) => !hiddenSlugs.has(item.slug));
        setPage(visiblePages[0] || null); setPost(body.posts?.[0] || null);
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
    const sections = (page.sections || []).map((section: Row, index: number) => ({
      ...section,
      title: String(form.get(`section_title_${index}`) || ""),
      body: String(form.get(`section_body_${index}`) || ""),
    }));
    const payload = {
      ...page,
      title: form.get("title"), eyebrow: form.get("eyebrow"), hero_title: form.get("hero_title"),
      hero_subtitle: form.get("hero_subtitle"), seo_title: form.get("seo_title"),
      seo_description: form.get("seo_description"), status: form.get("status"), sections,
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

  function createNew() {
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
          {(["pages", "blog"] as const).map(value => <button key={value} onClick={() => setTab(value)} className={`rounded-md px-5 py-2 text-xs font-bold ${tab === value ? "bg-magenta text-white" : ""}`}>{value === "pages" ? "Pages" : "Blog"}</button>)}
        </div>
        <button onClick={createNew} className="flex items-center gap-2 rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white"><Plus size={16} />Create {tab === "pages" ? "Page" : "Post"}</button>
      </div>
      {notice ? <p className="mb-4 rounded-lg bg-blush/50 p-3 text-sm text-plum">{notice}</p> : null}
      {saving ? <p className="mb-4 text-xs font-bold text-magenta">Saving and verifying in Supabase…</p> : null}
      {tab === "pages" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[250px_1fr]">
          <aside className="rounded-xl border border-plum/10 bg-white p-3">
            <h2 className="px-2 py-2 font-serif text-xl text-plum">Public Pages</h2>
            {slugs.map(slug => <button key={slug} onClick={() => setPage(pages.find(item => item.slug === slug) || { slug, title: slug, hero_title: slug, sections: [], status: "Draft" })} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${page?.slug === slug ? "bg-blush text-magenta" : ""}`}><FileText size={15} />{slug}</button>)}
          </aside>
          {page ? <PageEditor key={page.slug} page={page} setPage={setPage} save={savePage} /> : null}
        </div>
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border border-plum/10 bg-white p-3">{posts.map(item => <button key={item.id} onClick={() => setPost(item)} className={`mb-1 w-full rounded-lg p-3 text-left ${post?.id === item.id ? "bg-blush" : ""}`}><b className="block text-xs text-plum">{item.title}</b><small>{item.status} · {item.category}</small></button>)}</aside>
          {post ? <PostEditor key={post.id || "new"} post={post} setPost={setPost} save={savePost} remove={removePost} /> : null}
        </div>
      )}
    </div>
  );
}

function PageEditor({ page, setPage, save }: { page: Row; setPage: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5"><div className="grid gap-4 lg:grid-cols-2"><Field label="Page title" name="title" value={page.title} /><Field label="Eyebrow" name="eyebrow" value={page.eyebrow} /><div className="lg:col-span-2"><Field label="Hero heading" name="hero_title" value={page.hero_title} /></div><Area label="Hero description" name="hero_subtitle" value={page.hero_subtitle} rows={3} /><ImageUpload bucket="content-media" value={page.hero_image_url} onChange={value => setPage(row => ({ ...row, hero_image_url: value }))} label="Hero image" folder={page.slug} /><ImageUpload bucket="content-media" value={page.background_image_url} onChange={value => setPage(row => ({ ...row, background_image_url: value }))} label="Background image" folder={page.slug} /></div><h2 className="mt-6 font-serif text-2xl text-plum">Sections</h2><div className="mt-3 space-y-3">{(page.sections || []).map((section: Row, index: number) => <div key={index} className="rounded-lg bg-blush/25 p-4"><Field label="Section heading" name={`section_title_${index}`} value={section.title} /><Area label="Section text" name={`section_body_${index}`} value={section.body} rows={4} /></div>)}</div><button type="button" onClick={() => setPage(row => ({ ...row, sections: [...(row?.sections || []), { title: "New Section", body: "" }] }))} className="mt-3 text-xs font-bold text-magenta">+ Add section</button><div className="mt-6 grid gap-3 sm:grid-cols-2"><Field label="SEO title" name="seo_title" value={page.seo_title} /><Field label="SEO description" name="seo_description" value={page.seo_description} /><label className="text-xs font-bold">Status<select name="status" defaultValue={page.status || "Draft"} className="mt-1 w-full rounded-lg border p-3 font-normal"><option>Draft</option><option>Published</option></select></label></div><button className="mt-6 rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white">Save Page</button></form>;
}

function PostEditor({ post, setPost, save, remove }: { post: Row; setPost: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void; remove: () => void }) {
  return <form onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Title" name="title" value={post.title} /><Field label="Slug" name="slug" value={post.slug} /><Field label="Category" name="category" value={post.category} /><label className="text-xs font-bold">Status<select name="status" defaultValue={post.status} className="mt-1 w-full rounded-lg border p-3"><option>Draft</option><option>Published</option></select></label></div><Area label="Excerpt" name="excerpt" value={post.excerpt} rows={3} /><ImageUpload bucket="content-media" value={post.cover_image_url} onChange={value => setPost(row => ({ ...row, cover_image_url: value }))} label="Cover image" folder="blog" /><Area label="Article content · use ### for headings" name="content" value={post.content} rows={16} /><label className="mt-3 flex gap-2 text-xs"><input type="checkbox" name="featured" defaultChecked={post.featured} />Feature this post</label><div className="mt-5 flex gap-3"><button className="rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white">Save Post</button>{post.id ? <button type="button" onClick={remove} className="flex items-center gap-2 rounded-lg border border-red-300 px-5 py-3 text-xs text-red-600"><Trash2 size={15} />Delete</button> : null}</div></form>;
}

function Field({ label, name, value }: { label: string; name: string; value?: string }) { return <label className="block text-xs font-bold">{label}<input name={name} defaultValue={value || ""} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>; }
function Area({ label, name, value, rows }: { label: string; name: string; value?: string; rows: number }) { return <label className="mt-4 block text-xs font-bold">{label}<textarea name={name} defaultValue={value || ""} rows={rows} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal leading-6" /></label>; }
