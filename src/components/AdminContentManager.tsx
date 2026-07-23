/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, FileText, Monitor, Plus, Smartphone, Trash2 } from "lucide-react";
import BaseImageUpload from "@/components/ImageUpload";
import HeroImageFraming from "@/components/admin/HeroImageFraming";
import { sortCatalogRecords } from "@/lib/catalogOrdering";
import { adminSupabase as supabase } from "@/lib/supabase";

type Row = Record<string, any>;
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const ImageUpload = (props: React.ComponentProps<typeof BaseImageUpload>) => <BaseImageUpload {...props} authScope="admin" />;
const defaultSlugs = ["home", "salon-profile", "partner", "how-it-works", "about", "press", "testimonials", "help", "safety"];
const legalSlugs = ["terms", "privacy", "cookie-notice", "deposit-refund-policy", "salon-partner-agreement", "photo-content-consent", "message-monitoring-disclosure", "do-not-sell-or-share", "accessibility", "community-guidelines"];
const hiddenSlugs = new Set(["careers", "cancellation-policy"]);
const labelSlots: Record<string, Array<[string, string]>> = {
  home: [["social_proof_heading", "Hero social proof heading"], ["social_proof_subheading", "Hero social proof detail"], ["social_proof_note", "Hero social proof note"], ["salons_near_you_subheading", "Salons Near You subheading"], ["featured_salons_subheading", "Featured Salons subheading"], ["trending_now_subheading", "Trending Now subheading"], ["trending_picks_subheading", "Trending Picks subheading"]],
  "salon-profile": [["trust_label_1", "Salon trust label 1"], ["trust_label_2", "Salon trust label 2"], ["trust_label_3", "Salon trust label 3"]],
  partner: [["stat_label_1", "Partner photo label 1"], ["stat_label_2", "Partner photo label 2"], ["stat_label_3", "Partner photo label 3"]],
};

export default function AdminContentManager() {
  const [tab, setTab] = useState<"pages" | "legal" | "blog" | "styles">("pages");
  const [pages, setPages] = useState<Row[]>([]);
  const [posts, setPosts] = useState<Row[]>([]);
  const [page, setPage] = useState<Row | null>(null);
  const [post, setPost] = useState<Row | null>(null);
  const [masterStyles, setMasterStyles] = useState<Row[]>([]);
  const [masterStyle, setMasterStyle] = useState<Row | null>(null);
  const [serviceCategories, setServiceCategories] = useState<Row[]>([]);
  const [serviceGroups, setServiceGroups] = useState<Row[]>([]);
  const [serviceAddons, setServiceAddons] = useState<Row[]>([]);
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
      const loadedGroups = asRows(body.serviceGroups);
      const loadedAddons = asRows(body.serviceAddons);
      const loadedTargets = asRows(body.linkTargets);
      setPages(loadedPages);
      setPosts(loadedPosts);
      setMasterStyles(loadedStyles);
      setServiceCategories(loadedCategories);
      setServiceGroups(loadedGroups);
      setServiceAddons(loadedAddons);
      setLinkTargets(loadedTargets);
      if (selectFirst) {
        const visiblePages = loadedPages.filter((item: Row) => !hiddenSlugs.has(item.slug));
        setPage(visiblePages[0] || null);
        setPost(loadedPosts[0] || null);
        setMasterStyle(loadedStyles[0] || null);
      }
      return { pages: loadedPages, posts: loadedPosts, masterStyles: loadedStyles, serviceCategories: loadedCategories, serviceGroups: loadedGroups, serviceAddons: loadedAddons, linkTargets: loadedTargets };
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
        const loadedPages = asRows(body.pages); const loadedPosts = asRows(body.posts); const loadedStyles = asRows(body.masterStyles); const loadedCategories = asRows(body.serviceCategories); const loadedGroups = asRows(body.serviceGroups); const loadedAddons = asRows(body.serviceAddons); const loadedTargets = asRows(body.linkTargets);
        setPages(loadedPages); setPosts(loadedPosts); setMasterStyles(loadedStyles); setServiceCategories(loadedCategories); setServiceGroups(loadedGroups); setServiceAddons(loadedAddons); setLinkTargets(loadedTargets);
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

  function createNew() {
    if (tab === "legal") return;
    if (tab === "blog") {
      setPost({ slug: "new-post", title: "New Blog Post", excerpt: "", content: "", category: "Braided Styles", status: "Draft", featured: false });
      return;
    }
    const slug = prompt("Page slug (example: faq)")?.trim().toLowerCase();
    if (slug) setPage({ slug, title: slug.replaceAll("-", " "), hero_title: "New page", sections: [], status: "Draft" });
  }

  const allSlugs = [...new Set([...defaultSlugs, ...legalSlugs, ...pages.map(item => item.slug)])].filter(slug => !hiddenSlugs.has(slug));
  const contentSlugs = allSlugs.filter((slug) => !legalSlugs.includes(slug));
  const visibleSlugs = tab === "legal" ? legalSlugs : contentSlugs;

  function switchTab(value: "pages" | "legal" | "blog" | "styles") {
    setTab(value);
    if (value === "legal") {
      const slug = legalSlugs[0];
      setPage(pages.find((item) => item.slug === slug) || { slug, title: "Terms of Service", hero_title: "Terms of Service", hero_subtitle: "", sections: [{ type: "text", title: "", body: "", is_visible: true }], page_group: "Legal", status: "Published", is_enabled: true });
    } else if (value === "pages" && page && legalSlugs.includes(page.slug)) {
      const slug = contentSlugs[0];
      setPage(pages.find((item) => item.slug === slug) || null);
    }
  }

  if (loading) return <div className="rounded-xl border border-plum/10 bg-white p-8 text-sm text-ink/60">Loading editable content…</div>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-plum/10 bg-white p-1">
          {(["pages", "legal", "blog", "styles"] as const).map(value => <button key={value} onClick={() => switchTab(value)} className={`rounded-md px-5 py-2 text-xs font-bold ${tab === value ? "bg-magenta text-white" : ""}`}>{value === "pages" ? "Pages" : value === "legal" ? "Legal" : value === "blog" ? "Blog" : "Service Catalog"}</button>)}
        </div>
        {tab !== "legal" && tab !== "styles" ? <button onClick={createNew} className="flex items-center gap-2 rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white"><Plus size={16} />Create {tab === "pages" ? "Page" : "Post"}</button> : null}
      </div>
      {notice ? <p className="mb-4 rounded-lg bg-blush/50 p-3 text-sm text-plum">{notice}</p> : null}
      {saving ? <p className="mb-4 text-xs font-bold text-magenta">Saving and verifying in Supabase…</p> : null}
      {tab === "pages" || tab === "legal" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[250px_1fr]">
          <aside className="rounded-xl border border-plum/10 bg-white p-3">
            <h2 className="px-2 py-2 font-serif text-xl text-plum">{tab === "legal" ? "Legal Pages" : "Public Pages"}</h2>
            {visibleSlugs.map(slug => <button key={slug} onClick={() => setPage(pages.find(item => item.slug === slug) || { slug, title: slug.replaceAll("-", " "), hero_title: slug.replaceAll("-", " "), hero_subtitle: "", sections: tab === "legal" ? [{ type: "text", title: "", body: "", is_visible: true }] : [], page_group: tab === "legal" ? "Legal" : "Content", status: tab === "legal" ? "Published" : "Draft", is_enabled: true })} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${page?.slug === slug ? "bg-blush text-magenta" : ""}`}><FileText size={15} />{slug}</button>)}
          </aside>
          {page ? tab === "legal" ? <LegalPageEditor key={page.slug} page={page} setPage={setPage} save={savePage} /> : <PageEditor key={page.slug} page={page} setPage={setPage} save={savePage} linkTargets={linkTargets} /> : null}
        </div>
      ) : tab === "blog" ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border border-plum/10 bg-white p-3">{posts.map(item => <button key={item.id} onClick={() => setPost(item)} className={`mb-1 w-full rounded-lg p-3 text-left ${post?.id === item.id ? "bg-blush" : ""}`}><b className="block text-xs text-plum">{item.title}</b><small>{item.status} · {item.category}</small></button>)}</aside>
          {post ? <PostEditor key={post.id || "new"} post={post} setPost={setPost} save={savePost} remove={removePost} /> : null}
        </div>
      ) : (
        <ServiceCatalogManager categories={serviceCategories} groups={serviceGroups} addons={serviceAddons} services={masterStyles} initialService={masterStyle} setInitialService={setMasterStyle} authHeaders={authHeaders} reload={loadContent} setNotice={setNotice} saving={saving} setSaving={setSaving} />
      )}
    </div>
  );
}

type CatalogKind = "service_category" | "service_group" | "master_style" | "service_addon";
function ServiceCatalogManager({ categories, groups, addons, services, initialService, setInitialService, authHeaders, reload, setNotice, saving, setSaving }: {
  categories: Row[]; groups: Row[]; addons: Row[]; services: Row[]; initialService: Row | null;
  setInitialService: React.Dispatch<React.SetStateAction<Row | null>>;
  authHeaders: () => Promise<Record<string, string>>;
  reload: (selectFirst?: boolean) => Promise<{ masterStyles: Row[]; serviceCategories: Row[]; serviceGroups: Row[]; serviceAddons: Row[] }>;
  setNotice: (message: string) => void; saving: boolean; setSaving: (value: boolean) => void;
}) {
  const [kind, setKind] = useState<CatalogKind>("master_style");
  const [selected, setSelected] = useState<Row | null>(initialService || services[0] || null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dependency, setDependency] = useState<Row | null>(null);
  const [batchDependencies, setBatchDependencies] = useState<Record<string, Row>>({});
  const [batchResults, setBatchResults] = useState<Array<{ id: string; name: string; ok: boolean; message: string }>>([]);
  const [reason, setReason] = useState("Catalog maintenance");
  const [replacementId, setReplacementId] = useState("");
  const [orderingMode,setOrderingMode]=useState<"alphabetical"|"custom">(Number((initialService||services[0])?.sort_order||0)>0?"custom":"alphabetical");
  const collections: Record<CatalogKind, Row[]> = {
    service_category: sortCatalogRecords(categories),
    service_group: sortCatalogRecords(groups),
    master_style: sortCatalogRecords(services),
    service_addon: sortCatalogRecords(addons),
  };
  const labels: Record<CatalogKind, string> = { service_category: "Categories", service_group: "Service Groups", master_style: "Service Names", service_addon: "Add-ons" };
  const rows = collections[kind];
  const visibleIds = new Set(rows.map((row) => String(row.id)));
  const selectedRows = rows.filter((row) => selectedIds.includes(String(row.id)));
  const displayedTargets = selectedRows.length ? selectedRows : selected?.id ? [selected] : [];

  function switchKind(next: CatalogKind) {
    setKind(next);
    const first = collections[next][0] || null;
    setSelected(first);
    setOrderingMode(Number(first?.sort_order || 0) > 0 ? "custom" : "alphabetical");
    setSelectedIds([]);
    setDependency(null);
    setBatchDependencies({});
    setBatchResults([]);
    setReplacementId("");
  }

  async function inspectDependency(recordId: string) {
    const response = await fetch(`/api/admin/records?resource=${encodeURIComponent(kind)}&id=${encodeURIComponent(recordId)}`, { headers: await authHeaders(), cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to inspect dependencies.");
    return body as Row;
  }

  useEffect(() => {
    let active = true;
    if (!selected?.id) return;
    void (async () => {
      try {
        const body = await inspectDependency(String(selected.id));
        if (active) setDependency(body);
      } catch (error) {
        if (active) setDependency({ error: error instanceof Error ? error.message : "Dependency preview is unavailable." });
      }
    })();
    return () => { active = false; };
  }, [kind, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    const ids = selectedIds.filter((id) => visibleIds.has(id));
    if (!ids.length) {
      return () => { active = false; };
    }
    void Promise.all(ids.map(async (id) => {
      try { return [id, await inspectDependency(id)] as const; }
      catch (error) { return [id, { error: error instanceof Error ? error.message : "Dependency preview is unavailable." }] as const; }
    })).then((entries) => { if (active) setBatchDependencies(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [kind, selectedIds.join("|"), rows.map((row) => String(row.id)).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  function createItem() {
    setDependency(null);
    setSelectedIds([]);
    setBatchDependencies({});
    setBatchResults([]);
    setOrderingMode("alphabetical");
    if (kind === "service_category") setSelected({ name: "", slug: "", description: "", is_active: true });
    else if (kind === "master_style") setSelected({ name: "", service_group_id: groups.find((item) => item.is_active)?.id || "", is_active: true });
    else setSelected({ name: "", category_id: categories.find((item) => item.is_active)?.id || "", is_active: true });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const customPosition=Math.max(1,Number(form.get("custom_position")||1));
    const payload: Row = { ...selected, name: form.get("name"), sort_order: orderingMode==="custom"?customPosition*10:0, is_active: form.get("is_active") === "on" };
    if (kind === "service_category") { payload.slug = form.get("slug"); payload.description = form.get("description"); }
    if (kind === "service_group" || kind === "service_addon") payload.category_id = form.get("category_id");
    if (kind === "master_style") payload.service_group_id = form.get("service_group_id");
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/admin/content", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ type: kind, payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Catalog save failed");
      const loaded = await reload(false);
      const refreshed = ({ service_category: loaded.serviceCategories, service_group: loaded.serviceGroups, master_style: loaded.masterStyles, service_addon: loaded.serviceAddons } as Record<CatalogKind, Row[]>)[kind].find((item) => item.id === body.data.id);
      if (!refreshed) throw new Error("The saved catalog item could not be verified after reloading.");
      setSelected(refreshed);
      if (kind === "master_style") setInitialService(refreshed);
      setNotice(`${labels[kind].replace(/s$/, "")} saved and available to salon owners.`);
    } catch (error) {
      console.error("Service Catalog save error", { kind, selected, error });
      setNotice(error instanceof Error ? error.message : "Catalog save failed");
    } finally { setSaving(false); }
  }

  async function managedAction(action: "archive" | "restore" | "delete" | "reassign") {
    const targets = displayedTargets;
    if (!targets.length) return;
    if (reason.trim().length < 5) { setNotice("Enter a reason of at least 5 characters."); return; }
    if (action === "reassign" && !replacementId) { setNotice("Choose an active replacement record."); return; }
    if (action === "reassign" && targets.some((target) => String(target.id) === replacementId)) { setNotice("The replacement cannot also be selected for reassignment."); return; }
    setSaving(true); setNotice("");
    try {
      const inspected = await Promise.all(targets.map(async (target) => [String(target.id), await inspectDependency(String(target.id))] as const));
      const currentDependencies = Object.fromEntries(inspected);
      setBatchDependencies(currentDependencies);
      const verb = ({ archive: "Archive", restore: "Restore", delete: "Permanently delete", reassign: "Reassign and remove" } as const)[action];
      const dependencyLines = targets.map((target) => {
        const total = Number(currentDependencies[String(target.id)]?.dependencies?.total || 0);
        return `- ${target.name}: ${total} dependent record${total === 1 ? "" : "s"}`;
      });
      const warning = action === "delete" ? "\nDelete is refused when protected dependencies or retained history exist." : "";
      if (!confirm(`${verb} ${targets.length} catalog item${targets.length === 1 ? "" : "s"}?\n\n${dependencyLines.join("\n")}${warning}\n\nEvery successful change is written to the audit history.`)) return;

      const results: Array<{ id: string; name: string; ok: boolean; message: string }> = [];
      for (const target of targets) {
        try {
          const response = await fetch("/api/admin/records", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ resource: kind, id: target.id, action, reason: reason.trim(), reassign_to: replacementId || null, confirmation: target.name }) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || `${action} failed`);
          results.push({ id: String(target.id), name: String(target.name), ok: true, message: "Completed" });
        } catch (error) {
          const message = error instanceof Error ? error.message : `${action} failed`;
          console.error("Service Catalog record action failed", { kind, id: target.id, action, error });
          results.push({ id: String(target.id), name: String(target.name), ok: false, message });
        }
      }
      const loaded = await reload(false);
      const refreshedRows = sortCatalogRecords(({ service_category: loaded.serviceCategories, service_group: loaded.serviceGroups, master_style: loaded.masterStyles, service_addon: loaded.serviceAddons } as Record<CatalogKind, Row[]>)[kind]);
      const failedIds = results.filter((result) => !result.ok).map((result) => result.id);
      const next = refreshedRows.find((row) => failedIds.includes(String(row.id))) || refreshedRows[0] || null;
      setSelected(next);
      setDependency(null);
      setSelectedIds(failedIds);
      setBatchResults(results);
      if (!failedIds.length) setReplacementId("");
      const completed = results.filter((result) => result.ok).length;
      setNotice(`${completed} of ${results.length} catalog item${results.length === 1 ? "" : "s"} completed. ${failedIds.length ? "Review the item results below; failed items were not changed." : "All selected changes were verified after reload."}`);
    } catch (error) {
      console.error("Service Catalog managed action error", { kind, targetIds: targets.map((target) => target.id), action, error });
      setNotice(error instanceof Error ? error.message : `${action} failed`);
    } finally { setSaving(false); }
  }

  return <div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap rounded-lg border border-plum/10 bg-white p-1">{(Object.keys(labels) as CatalogKind[]).map((value) => <button key={value} type="button" onClick={() => switchKind(value)} className={`rounded-md px-4 py-2 text-xs font-bold ${kind === value ? "bg-plum text-white" : "text-plum"}`}>{labels[value]}</button>)}</div>
      <button type="button" onClick={createItem} className="inline-flex items-center gap-2 rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white"><Plus size={15}/>Add {labels[kind].replace(/s$/, "")}</button>
    </div>
    <div className="grid min-w-0 gap-5 xl:grid-cols-[280px_1fr]">
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between rounded-lg border border-plum/10 bg-white px-3 py-2 text-[10px]"><b className="text-plum">{selectedRows.length} selected</b><button type="button" disabled={!selectedRows.length} onClick={()=>{setSelectedIds([]);setBatchDependencies({});setBatchResults([]);}} className="font-bold text-magenta disabled:opacity-40">Clear selection</button></div>
      <aside className="max-h-[700px] overflow-y-auto rounded-xl border border-plum/10 bg-white p-3"><label className="mb-2 flex items-center gap-2 border-b border-plum/10 px-2 pb-3 text-[10px] font-bold text-plum"><input type="checkbox" checked={Boolean(rows.length) && selectedRows.length === rows.length} onChange={(event)=>{setSelectedIds(event.target.checked ? rows.map((row)=>String(row.id)) : []);setBatchResults([]);}} className="accent-magenta" />Select all current visible results</label>{rows.map((item) => <div key={item.id} className={`mb-1 grid grid-cols-[24px_1fr] items-start rounded-lg ${selected?.id === item.id ? "bg-blush" : ""}`}><input aria-label={`Select ${item.name}`} type="checkbox" checked={selectedIds.includes(String(item.id))} onChange={(event)=>{setSelectedIds((current)=>event.target.checked?[...new Set([...current,String(item.id)])]:current.filter((id)=>id!==String(item.id)));setBatchResults([]);}} className="ml-2 mt-4 accent-magenta"/><button type="button" onClick={() => { setDependency(null); setSelected(item);setOrderingMode(Number(item.sort_order||0)>0?"custom":"alphabetical"); if (kind === "master_style") setInitialService(item); }} className="w-full p-3 text-left"><b className="block text-xs text-plum">{item.name}</b><small>{item.service_category?.name || (kind === "service_category" ? item.slug : "")} {item.archived_at ? "· Archived" : item.is_active ? "· Active" : "· Hidden"}</small></button></div>)}{!rows.length ? <p className="p-4 text-center text-xs text-ink/50">No items yet.</p> : null}</aside>
      </div>
      {selected ? <form key={`${kind}-${selected.id || "new"}`} onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5">
        <h2 className="font-serif text-2xl text-plum">{selected.id ? `Edit ${labels[kind].replace(/s$/, "")}` : `Add ${labels[kind].replace(/s$/, "")}`}</h2>
        <p className="mt-1 text-xs leading-5 text-ink/55">Catalog lists are alphabetized automatically. Salon owners see active changes the next time their Styles & Pricing editor loads.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field required label="Name" name="name" value={selected.name} />
          <label className="text-xs font-bold">Display order<select value={orderingMode} onChange={(event)=>setOrderingMode(event.target.value as "alphabetical"|"custom")} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="alphabetical">Alphabetical (recommended)</option><option value="custom">Custom position</option></select></label>
          {orderingMode==="custom"?<label className="text-xs font-bold">Position<select name="custom_position" defaultValue={Math.max(1,Math.round(Number(selected.sort_order||10)/10))} className="mt-1 w-full rounded-lg border p-3 font-normal">{Array.from({length:Math.max(rows.length+1,1)},(_,index)=><option key={index+1} value={index+1}>{index+1}{index===0?" · First":""}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-ink/50">Items with custom positions appear first; the rest remain alphabetical.</span></label>:null}
          {kind === "service_category" ? <><Field required label="URL slug" name="slug" value={selected.slug} /><div className="sm:col-span-2"><Area label="Description" name="description" value={selected.description} rows={3}/></div></> : null}
          {kind === "service_group" || kind === "service_addon" ? <label className="text-xs font-bold">Category<select required name="category_id" defaultValue={selected.category_id || categories[0]?.id || ""} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">Choose category</option>{categories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
          {kind === "master_style" ? <label className="text-xs font-bold">Service group<select required name="service_group_id" defaultValue={selected.service_group_id || groups[0]?.id || ""} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">Choose service group</option>{groups.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.service_category?.name} · {item.name}</option>)}</select></label> : null}
          <label className="flex items-center gap-2 self-end rounded-lg border border-plum/10 p-3 text-xs font-bold"><input type="checkbox" name="is_active" defaultChecked={selected.is_active !== false} className="accent-magenta" />Visible to salon owners</label>
        </div>
        {batchResults.length && !selectedRows.length ? <section className="mt-5 rounded-xl border border-plum/10 bg-white p-4"><h3 className="font-serif text-lg text-plum">Last batch results</h3><ul className="mt-2 space-y-1 text-xs">{batchResults.map((result)=><li key={`${result.id}-${result.ok}`} className={result.ok ? "text-green-700" : "text-red-700"}>{result.ok ? "Completed" : "Not changed"}: {result.name} · {result.message}</li>)}</ul></section> : null}
        {selectedRows.length ? <section className="mt-5 rounded-xl border border-magenta/20 bg-blush/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-serif text-lg text-plum">Batch dependency preview</h3><b className="rounded-full bg-plum px-3 py-1 text-[10px] text-white">{selectedRows.length} selected</b></div>
          <div className="mt-3 space-y-2">{selectedRows.map((target) => { const preview = batchDependencies[String(target.id)]; const total = Number(preview?.dependencies?.total || 0); return <div key={target.id} className="rounded-lg border border-plum/10 bg-white p-3 text-xs"><div className="flex items-center justify-between gap-3"><b className="text-plum">{target.name}</b><span>{preview?.error ? "Preview failed" : preview ? `${total} dependent record${total === 1 ? "" : "s"}` : "Checking…"}</span></div>{preview?.dependencies?.details?.length ? <ul className="mt-2 space-y-1 text-[10px] text-ink/60">{preview.dependencies.details.map((item:Row)=><li key={item.label}>{item.label}: <b>{item.count}</b> · {item.retention}</li>)}</ul> : null}{preview?.error ? <p className="mt-2 text-[10px] text-red-700">{preview.error}</p> : null}</div>; })}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Reason for every selected record" name="batch_reason" value={reason} onChange={setReason}/>{kind === "master_style" || kind === "service_group" ? <label className="text-xs font-bold">Reassign all to<select value={replacementId} onChange={(event)=>setReplacementId(event.target.value)} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">Choose replacement</option>{rows.filter((row)=>!selectedIds.includes(String(row.id))&&row.is_active&&!row.archived_at).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:null}</div>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={()=>void managedAction("archive")} className="rounded-lg border border-plum/20 px-4 py-2 text-xs font-bold text-plum disabled:opacity-40">Archive ({selectedRows.length})</button><button type="button" disabled={saving} onClick={()=>void managedAction("restore")} className="rounded-lg border border-green-300 px-4 py-2 text-xs font-bold text-green-700 disabled:opacity-40">Restore ({selectedRows.length})</button>{kind === "master_style" || kind === "service_group" ? <button type="button" disabled={saving||!replacementId} onClick={()=>void managedAction("reassign")} className="rounded-lg border border-amber-300 px-4 py-2 text-xs font-bold text-amber-800 disabled:opacity-40">Reassign ({selectedRows.length})</button>:null}<button type="button" disabled={saving} onClick={()=>void managedAction("delete")} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-40"><Trash2 size={14}/>Safe Delete ({selectedRows.length})</button></div>
          {batchResults.length ? <div className="mt-4 rounded-lg border border-plum/10 bg-white p-3"><b className="text-xs text-plum">Last batch results</b><ul className="mt-2 space-y-1 text-[10px]">{batchResults.map((result)=><li key={`${result.id}-${result.ok}`} className={result.ok ? "text-green-700" : "text-red-700"}>{result.ok ? "Completed" : "Not changed"}: {result.name} · {result.message}</li>)}</ul></div> : null}
        </section> : null}
        {selected.id ? <section className="mt-5 rounded-xl border border-plum/10 bg-cream/45 p-4"><h3 className="font-serif text-lg text-plum">Dependencies & safe actions</h3>{dependency?.dependencies?.details?.length ? <ul className="mt-2 space-y-1 text-xs text-ink/65">{dependency.dependencies.details.map((item:Row)=><li key={item.label}>{item.label}: <b>{item.count}</b> · {item.retention}</li>)}</ul> : <p className="mt-2 text-xs text-ink/55">{dependency?.error || "No dependent records were found."}</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Reason" name="managed_reason" value={reason} onChange={setReason}/>{kind === "master_style" || kind === "service_group" ? <label className="text-xs font-bold">Reassign to<select value={replacementId} onChange={(event)=>setReplacementId(event.target.value)} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">Choose replacement</option>{rows.filter((row)=>row.id!==selected.id&&row.is_active&&!row.archived_at).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:null}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving||Boolean(selected.archived_at)} onClick={()=>void managedAction("archive")} className="rounded-lg border border-plum/20 px-4 py-2 text-xs font-bold text-plum disabled:opacity-40">Archive{selectedIds.length?` (${selectedIds.length})`:""}</button><button type="button" disabled={saving||!selected.archived_at} onClick={()=>void managedAction("restore")} className="rounded-lg border border-green-300 px-4 py-2 text-xs font-bold text-green-700 disabled:opacity-40">Restore</button>{kind === "master_style" || kind === "service_group" ? <button type="button" disabled={saving||!replacementId} onClick={()=>void managedAction("reassign")} className="rounded-lg border border-amber-300 px-4 py-2 text-xs font-bold text-amber-800 disabled:opacity-40">Reassign</button>:null}<button type="button" disabled={saving} onClick={()=>void managedAction("delete")} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-xs font-bold text-red-700"><Trash2 size={14}/>Safe Delete{selectedIds.length?` (${selectedIds.length})`:""}</button></div></section>:null}
        <div className="mt-6 flex flex-wrap gap-3"><button disabled={saving} className="rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Catalog Item"}</button></div>
      </form> : <div className="rounded-xl border border-dashed border-plum/15 bg-white p-8 text-center text-sm text-ink/50">Add the first catalog item.</div>}
    </div>
  </div>;
}

function LegalPageEditor({ page, setPage, save }: { page: Row; setPage: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void }) {
  const section = asRows(page.sections)[0] || { type: "text", title: "", body: "", is_visible: true };
  return <form onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5">
    <h2 className="font-serif text-2xl text-plum">Edit Legal Page</h2>
    <p className="mt-1 text-xs leading-5 text-ink/55">Use # for a large heading, ## or ### for smaller headings, - for bullets, and [label](/page) for a link. HTML is not accepted.</p>
    <label className="mt-5 block text-xs font-bold">Page title<input required name="title" value={page.title || ""} onChange={(event) => setPage((row) => ({ ...row, title: event.target.value, hero_title: event.target.value, page_group: "Legal" }))} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
    <input type="hidden" name="eyebrow" value="" readOnly />
    <input type="hidden" name="hero_title" value={page.title || ""} readOnly />
    <input type="hidden" name="hero_subtitle" value="" readOnly />
    <input type="hidden" name="section_title_0" value={section.title || ""} readOnly />
    <Area label="Rich-text body" name="section_body_0" value={section.body} rows={22} />
    <input type="hidden" name="seo_title" value={page.seo_title || page.title || ""} readOnly />
    <input type="hidden" name="seo_description" value={page.seo_description || ""} readOnly />
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Publish status<select name="status" defaultValue={page.status || "Draft"} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option>Draft</option><option>Published</option></select></label><label className="flex items-center justify-between gap-4 rounded-lg border border-plum/10 p-3 text-xs font-bold"><span><span className="block">Shown on public site</span><small className="mt-1 block font-normal text-ink/55">Turn off to remove both the page and footer link without deleting its content.</small></span><input type="checkbox" checked={page.is_enabled !== false} onChange={(event) => setPage((row) => ({ ...row, is_enabled: event.target.checked }))} className="h-5 w-5 accent-magenta" /></label></div>
    <button className="mt-6 rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white">Save Legal Page</button>
  </form>;
}

function PageEditor({ page, setPage, save, linkTargets }: { page: Row; setPage: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void; linkTargets: Row[] }) {
  const slots = labelSlots[page.slug] || [];
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  function moveSection(index: number, direction: -1 | 1) {
    setPage((row) => { const sections = [...asRows(row?.sections)]; const nextIndex=index+direction;if(nextIndex<0||nextIndex>=sections.length)return row;[sections[index],sections[nextIndex]]=[sections[nextIndex],sections[index]];return{...row,sections}; });
  }
  return <form onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-2xl text-plum">Page composition</h2><p className="mt-1 text-xs text-ink/55">Edit constrained Girlz Culture sections and preview the current draft before publishing.</p></div><div className="flex rounded-lg border p-1"><button type="button" onClick={()=>setPreviewMode("desktop")} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-[10px] font-bold ${previewMode==="desktop"?"bg-plum text-white":"text-plum"}`}><Monitor size={13}/>Desktop</button><button type="button" onClick={()=>setPreviewMode("mobile")} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-[10px] font-bold ${previewMode==="mobile"?"bg-plum text-white":"text-plum"}`}><Smartphone size={13}/>Mobile</button></div></div>
    <ContentPagePreview page={page} mode={previewMode}/>
    <div className="grid gap-4 lg:grid-cols-2">
      <Field required label="Page title" name="title" value={page.title} />
      <Field label="Eyebrow" name="eyebrow" value={page.eyebrow} />
      <div className="lg:col-span-2"><Field required label="Hero heading" name="hero_title" value={page.hero_title} /></div>
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
    <div className="mt-3 space-y-3">{asRows(page.sections).map((section: Row, index: number, sections:Row[]) => <SectionEditor key={`${section.id || index}-${asRows(section.cards).length}`} section={section} index={index} sectionCount={sections.length} linkTargets={linkTargets} move={(direction)=>moveSection(index,direction)} update={(next) => setPage(row => ({ ...row, sections: asRows(row?.sections).map((item: Row, itemIndex: number) => itemIndex === index ? next : item) }))} remove={() => setPage(row => ({ ...row, sections: asRows(row?.sections).filter((_: Row, itemIndex: number) => itemIndex !== index) }))} />)}</div>
    <button type="button" onClick={() => setPage(row => ({ ...row, sections: [...asRows(row?.sections), { id: crypto.randomUUID(), type: "card_grid", title: "New Section", body: "", is_visible: true, columns: 4, cards: [] }] }))} className="mt-3 text-xs font-bold text-magenta">+ Add section</button>
    <div className="mt-6 grid gap-3 sm:grid-cols-2"><Field label="SEO title" name="seo_title" value={page.seo_title} /><Field label="SEO description" name="seo_description" value={page.seo_description} /><label className="text-xs font-bold">Status<select name="status" defaultValue={page.status || "Draft"} className="mt-1 w-full rounded-lg border p-3 font-normal"><option>Draft</option><option>Published</option></select></label></div>
    <button className="mt-6 rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white">Save Page</button>
  </form>;
}

function SectionEditor({ section, index, sectionCount, linkTargets, update, remove, move }: { section: Row; index: number; sectionCount:number; linkTargets: Row[]; update: (section: Row) => void; remove: () => void;move:(direction:-1|1)=>void }) {
  const type = String(section.type || "text");
  const cards = asRows(section.cards);
  const maximum = type === "community_carousel" ? 20 : 12;
  const [cardCountDraft, setCardCountDraft] = useState(String(cards.length || 1));
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
  function commitCardCount() {
    const count = Number(cardCountDraft);
    if (!Number.isInteger(count) || count < 1 || count > maximum) {
      setCardCountDraft(String(cards.length || 1));
      return;
    }
    resizeCards(count);
  }
  return <div className="rounded-lg border border-plum/10 bg-blush/25 p-4">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Layout<select value={type} onChange={(event) => update({ ...section, type: event.target.value, cards: ["card_grid", "carousel", "community_carousel"].includes(event.target.value) ? cards : [] })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option value="text">Text</option><option value="card_grid">Card grid</option><option value="carousel">Horizontal carousel</option><option value="community_carousel">Auto-scrolling community carousel</option><option value="banner">Banner</option></select></label>
        {["card_grid", "carousel", "community_carousel"].includes(type) ? <label className="text-xs font-bold">Number of cards<input type="number" inputMode="numeric" min="1" max={maximum} value={cardCountDraft} onChange={(event) => setCardCountDraft(event.target.value)} onBlur={commitCardCount} onKeyDown={(event)=>{if(/[eE+\-.]/.test(event.key))event.preventDefault();if(event.key==="Enter"){event.preventDefault();commitCardCount();}}} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal" /></label> : null}
      </div>
      <div className="flex gap-1"><button type="button" aria-label={`Move section ${index+1} earlier`} onClick={()=>move(-1)} disabled={index===0} className="rounded-md border bg-white p-2 text-plum disabled:opacity-30"><ArrowUp size={14}/></button><button type="button" aria-label={`Move section ${index+1} later`} onClick={()=>move(1)} disabled={index===sectionCount-1} className="rounded-md border bg-white p-2 text-plum disabled:opacity-30"><ArrowDown size={14}/></button></div><label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold"><input type="checkbox" checked={section.is_visible !== false} onChange={(event) => update({ ...section, is_visible: event.target.checked })} className="accent-magenta" />Published on page</label>
      <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-xs font-bold text-red-600"><Trash2 size={14}/>Remove section</button>
    </div>
    <Field label="Section heading" name={`section_title_${index}`} value={section.title} />
    <Area label="Section text" name={`section_body_${index}`} value={section.body} rows={4} />
    {type === "banner" ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Button label" name={`section_cta_label_${index}`} value={section.cta_label} /><Field label="Button destination" name={`section_cta_href_${index}`} value={section.cta_href} /></div> : null}
    {type === "card_grid" ? <label className="mt-3 block text-xs font-bold">Columns<select value={Number(section.columns || 4)} onChange={(event) => update({ ...section, columns: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label> : null}
    {cards.length ? <div className="mt-4 grid gap-4 xl:grid-cols-2">{cards.map((card, cardIndex) => <article key={card.id || cardIndex} className="rounded-xl border border-plum/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><b className="font-serif text-lg text-plum">Card {cardIndex + 1}</b><div className="flex gap-1"><button type="button" aria-label="Move card up" onClick={() => moveCard(cardIndex, -1)} disabled={cardIndex === 0} className="rounded-md border p-2 text-plum disabled:opacity-30"><ArrowUp size={14}/></button><button type="button" aria-label="Move card down" onClick={() => moveCard(cardIndex, 1)} disabled={cardIndex === cards.length - 1} className="rounded-md border p-2 text-plum disabled:opacity-30"><ArrowDown size={14}/></button></div></div>
      <label className="mt-3 block text-xs font-bold">Card source<select value={card.content_type || "image"} onChange={(event) => updateCard(cardIndex, { ...card, content_type: event.target.value, salon_id: event.target.value === "salon" ? card.salon_id || "" : "" })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="image">Uploaded image</option><option value="video">Video</option><option value="link">Image with another link</option><option value="salon">Specific salon profile</option></select></label>
      {card.content_type === "salon" ? <label className="mt-3 block text-xs font-bold">Salon to feature<select required value={card.salon_id || ""} onChange={(event) => { const target = linkTargets.find((item) => item.type === "Salon" && item.id === event.target.value); updateCard(cardIndex, { ...card, salon_id: target?.id || "", title: target?.label || "", body: target?.body || "", media_url: target?.media_url || "", href: target?.href || "" }); }} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="">Choose a live salon</option>{linkTargets.filter((target) => target.type === "Salon").map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select><small className="mt-1 block font-normal text-ink/55">The card uses this salon’s name, cover photo, location, and public profile link.</small></label> : card.content_type === "video" ? <label className="mt-3 block text-xs font-bold">Video URL<input value={card.media_url || ""} onChange={(event) => updateCard(cardIndex, { ...card, media_url: event.target.value })} placeholder="https://…/video.mp4" className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label> : <ImageUpload bucket="content-media" value={card.media_url} onChange={(value) => updateCard(cardIndex, { ...card, media_url: typeof value === "string" ? value : "" })} label={card.content_type === "link" ? "Link card image" : "Card image"} folder={`${section.id || "section"}/card-${cardIndex + 1}`} />}
      <label className="mt-3 block text-xs font-bold">Card title<input value={card.title || ""} onChange={(event) => updateCard(cardIndex, { ...card, title: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
      <label className="mt-3 block text-xs font-bold">Card text<textarea rows={3} value={card.body || ""} onChange={(event) => updateCard(cardIndex, { ...card, body: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
      {card.content_type !== "salon" ? <><label className="mt-3 block text-xs font-bold">Destination<select value={linkTargets.some((target) => target.href === card.href) ? card.href : ""} onChange={(event) => updateCard(cardIndex, { ...card, href: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="">No saved destination / custom URL</option>{linkTargets.map((target) => <option key={`${target.type}-${target.href}`} value={target.href}>{target.type}: {target.label}</option>)}</select></label><label className="mt-3 block text-xs font-bold">Custom destination<input value={card.href || ""} onChange={(event) => updateCard(cardIndex, { ...card, href: event.target.value })} placeholder="/salon/example or https://…" className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label></> : <p className="mt-3 rounded-lg bg-blush/40 p-3 text-xs text-plum">Salon profile destination is linked automatically.</p>}
    </article>)}</div> : null}
  </div>;
}

function ContentPagePreview({page,mode}:{page:Row;mode:"desktop"|"mobile"}){const sections=asRows(page.sections).filter(section=>section.is_visible!==false);return <section className="mb-6 rounded-xl border border-dashed border-magenta/30 bg-cream p-4"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-magenta"><Eye size={13}/>Unpublished draft preview · {mode}</p><div className={`mx-auto mt-3 overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${mode==="mobile"?"max-w-[360px]":"max-w-full"}`}><div className="relative min-h-36 bg-[linear-gradient(120deg,#2c1135,#7a285f)] p-6 text-white"><span className="text-[9px] font-bold uppercase tracking-[.16em] text-amber">{String(page.eyebrow||page.title||"Girlz Culture")}</span><h3 className="mt-2 font-serif text-3xl leading-none">{String(page.hero_title||page.title||"Untitled page")}</h3><p className="mt-3 max-w-xl text-xs leading-5 text-white/75">{String(page.hero_subtitle||"")}</p></div><div className="space-y-4 p-4">{sections.map((section,index)=><div key={section.id||index} className="rounded-lg bg-blush/25 p-4"><h4 className="font-serif text-xl text-plum">{String(section.title||`Section ${index+1}`)}</h4>{section.body?<p className="mt-2 text-[10px] leading-5 text-ink/60">{String(section.body).slice(0,260)}</p>:null}{asRows(section.cards).length?<div className={`mt-3 grid gap-2 ${mode==="mobile"?"grid-cols-2":"grid-cols-4"}`}>{asRows(section.cards).slice(0,mode==="mobile"?4:8).map((card,cardIndex)=><div key={card.id||cardIndex} className="min-h-20 rounded-md border bg-white p-2"><b className="text-[9px] text-plum">{String(card.title||`Card ${cardIndex+1}`)}</b><p className="mt-1 line-clamp-2 text-[8px] text-ink/50">{String(card.body||"")}</p></div>)}</div>:null}</div>)}{!sections.length?<p className="rounded-lg border border-dashed p-6 text-center text-xs text-ink/45">No visible sections in this draft.</p>:null}</div></div></section>}

function PostEditor({ post, setPost, save, remove }: { post: Row; setPost: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void; remove: () => void }) {
  return <form onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5"><div className="grid gap-4 sm:grid-cols-2"><Field required label="Title" name="title" value={post.title} /><Field required label="Slug" name="slug" value={post.slug} /><Field required label="Category" name="category" value={post.category} /><label className="text-xs font-bold">Status<select name="status" defaultValue={post.status} className="mt-1 w-full rounded-lg border p-3"><option>Draft</option><option>Published</option></select></label></div><Area label="Excerpt" name="excerpt" value={post.excerpt} rows={3} /><ImageUpload bucket="content-media" value={post.cover_image_url} onChange={value => setPost(row => ({ ...row, cover_image_url: value }))} label="Cover image" folder="blog" /><Area label="Article content · use ### for headings" name="content" value={post.content} rows={16} /><label className="mt-3 flex gap-2 text-xs"><input type="checkbox" name="featured" defaultChecked={post.featured} />Feature this post</label><div className="mt-5 flex gap-3"><button className="rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white">Save Post</button>{post.id ? <button type="button" onClick={remove} className="flex items-center gap-2 rounded-lg border border-red-300 px-5 py-3 text-xs text-red-600"><Trash2 size={15} />Delete</button> : null}</div></form>;
}

function Field({ label, name, value, required = false, type = "text", onChange }: { label: string; name: string; value?: string | number; required?: boolean; type?: string; onChange?: (value: string) => void }) { return <label className="block text-xs font-bold">{label}<input required={required} type={type} name={name} defaultValue={value ?? ""} onChange={onChange ? (event)=>onChange(event.target.value) : undefined} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>; }
function Area({ label, name, value, rows }: { label: string; name: string; value?: string; rows: number }) { return <label className="mt-4 block text-xs font-bold">{label}<textarea name={name} defaultValue={value || ""} rows={rows} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal leading-6" /></label>; }
