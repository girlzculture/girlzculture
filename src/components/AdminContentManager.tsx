/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Download, Eye, FileSpreadsheet, FileText, Monitor, Plus, Smartphone, Tablet, Trash2, Upload } from "lucide-react";
import BaseImageUpload from "@/components/ImageUpload";
import HeroImageFraming from "@/components/admin/HeroImageFraming";
import { readApiResponse } from "@/lib/apiResponseClient";
import { sortCatalogRecords } from "@/lib/catalogOrdering";
import { adminSupabase as supabase } from "@/lib/supabase";
import NumericInput from "@/components/forms/NumericInput";
import ActionToast from "@/components/ActionToast";
import SafeImage from "@/components/site/SafeImage";
import { homepagePromotionPreview } from "@/lib/homePromotionCore";
import { useAdminListScrollRestoration } from "@/components/admin/useAdminListContext";

type Row = Record<string, any>;
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const ImageUpload = (props: React.ComponentProps<typeof BaseImageUpload>) => <BaseImageUpload {...props} authScope="admin" />;
const defaultSlugs = ["home", "salon-profile", "partner", "how-it-works", "about", "press", "testimonials", "help", "safety", "legal"];
const legalSlugs = ["terms", "privacy", "cookie-notice", "deposit-refund-policy", "salon-partner-agreement", "photo-content-consent", "message-monitoring-disclosure", "do-not-sell-or-share", "accessibility", "community-guidelines"];
const hiddenSlugs = new Set(["careers", "cancellation-policy"]);
const sectionPageSlugs = new Set(["about-carousel-one", "about-carousel-two"]);
const labelSlots: Record<string, Array<[string, string]>> = {
  home: [["home_intro_visible", "Desktop introduction visibility"], ["social_proof_heading", "Hero social proof heading"], ["social_proof_subheading", "Hero social proof detail"], ["social_proof_note", "Hero social proof note"], ["featured_products_subheading", "Featured Products subheading"], ["trending_now_subheading", "Trending Now subheading"]],
  "salon-profile": [["trust_label_1", "Salon trust label 1"], ["trust_label_2", "Salon trust label 2"], ["trust_label_3", "Salon trust label 3"]],
  partner: [["stat_label_1", "Partner photo label 1"], ["stat_label_2", "Partner photo label 2"], ["stat_label_3", "Partner photo label 3"]],
  about: [["mobile_preview", "Compact mobile introduction"], ["read_more_label", "Mobile read-more label"]],
};

type PublicationSummary = {
  saved_version?: string | null;
  public_version?: string | null;
  saved_card_count?: number;
  public_card_count?: number;
  fallback_count?: number;
  display_limit?: number;
  state?: string;
  is_public?: boolean;
};

function resolvedPublicationUi(record: Row, summary: PublicationSummary = {}) {
  const scheduledAt = Date.parse(String(record.scheduled_publish_at || ""));
  const dueScheduled = Boolean(record.scheduled_payload)
    && Number.isFinite(scheduledAt)
    && scheduledAt <= Date.now()
    && ["Published", "Scheduled"].includes(String(record.publication_state || ""));
  const retainedPublished = Boolean(record.published_payload)
    && record.publication_state === "Published";
  const isPublic = summary.is_public ?? (
    !record.archived_at
    && record.is_enabled !== false
    && (dueScheduled || retainedPublished)
  );
  const savedState = String(record.status || "Draft");
  return {
    isPublic,
    label: summary.state || (isPublic
      ? `${savedState} / Published version live`
      : record.archived_at
        ? "Archived / Not public"
        : `${savedState} / Not public`),
  };
}

function resolvedPublicSnapshot(record: Row): Row | null {
  const scheduledAt = Date.parse(String(record.scheduled_publish_at || ""));
  const dueScheduled = Boolean(record.scheduled_payload)
    && Number.isFinite(scheduledAt)
    && scheduledAt <= Date.now()
    && ["Published", "Scheduled"].includes(String(record.publication_state || ""));
  const candidate = dueScheduled
    ? record.scheduled_payload
    : record.publication_state === "Published"
      ? record.published_payload
      : null;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Row
    : null;
}

type ContentRecord =
  | { kind: "page"; slug: string; editor?: string }
  | { kind: "blog"; id: string }
  | { kind: "unknown" };

function parseContentRecord(recordId?: string): ContentRecord {
  const value = String(recordId || "").trim();
  if (!value) return { kind: "unknown" };
  if (value.startsWith("blog-")) return { kind: "blog", id: value.slice(5) };
  if (!value.startsWith("page-")) return { kind: "unknown" };
  const [pageId, editor] = value.split("--", 2);
  return { kind: "page", slug: pageId.slice(5), editor: editor || undefined };
}

function publicPageHref(slug: string) {
  if (slug === "home") return "/";
  if (sectionPageSlugs.has(slug)) return "/about";
  if (slug === "salon-profile") return "/salons";
  return `/${slug}`;
}

function adminContentHref(recordId?: string) {
  return recordId ? `/admin/content/${recordId}` : "/admin/content";
}

function recordPage(
  rows: Row[],
  recordId?: string,
) {
  const record = parseContentRecord(recordId);
  if (record.kind === "page") {
    const independentSlug = record.slug === "about" && record.editor === "promotional-carousel-one"
      ? "about-carousel-one"
      : record.slug === "about" && record.editor === "promotional-carousel-two"
        ? "about-carousel-two"
        : record.slug;
    const matched = rows.find((item) => item.slug === independentSlug) || null;
    if (matched && record.slug === "about" && !record.editor) {
      return {
        ...matched,
        _section_records: {
          "promotional-carousel-one": rows.find((item) => item.slug === "about-carousel-one") || null,
          "promotional-carousel-two": rows.find((item) => item.slug === "about-carousel-two") || null,
        },
      };
    }
    return matched ? ensureEditorSection(matched, record.editor) : null;
  }
  return rows.filter((item) => !hiddenSlugs.has(item.slug) && !sectionPageSlugs.has(item.slug))[0] || null;
}

function recordPost(rows: Row[], recordId?: string) {
  const record = parseContentRecord(recordId);
  if (record.kind !== "blog") return rows[0] || null;
  if (record.id === "new") {
    return { slug: "new-post", title: "New Blog Post", excerpt: "", content: "", category: "Braided Styles", status: "Draft", featured: false };
  }
  return rows.find((item) => String(item.id) === record.id || String(item.slug) === record.id) || null;
}

function ensureEditorSection(row: Row, editor?: string) {
  if (!row || !editor) return row;
  const sections = asRows(row.sections);
  const needsHomePromo = row.slug === "home" && editor === "hero-promotion-carousel";
  const needsHomeBanner = row.slug === "home" && editor === "announcement-banner";
  const needsAboutOne = ["about", "about-carousel-one"].includes(String(row.slug)) && editor === "promotional-carousel-one";
  const needsAboutTwo = ["about", "about-carousel-two"].includes(String(row.slug)) && editor === "promotional-carousel-two";
  if (needsHomePromo && !sections.some((section) => section.type === "promo_rail")) {
    return { ...row, sections: [{ id: "home-hero-promotion-carousel", type: "promo_rail", title: "", body: "", display_limit: 8, is_visible: true, cards: [] }, ...sections] };
  }
  if (needsHomeBanner && !sections.some((section) => section.type === "banner")) {
    return { ...row, sections: [...sections, { id: "home-announcement-banner", type: "banner", title: "", body: "", cta_label: "", cta_href: "", is_visible: false, cards: [] }] };
  }
  if (needsAboutOne || needsAboutTwo) {
    const carousels = sections.filter((section) => section.type === "community_carousel");
    const independentRecord = sectionPageSlugs.has(String(row.slug));
    const required = independentRecord ? 1 : needsAboutOne ? 1 : 2;
    if (carousels.length >= required) return row;
    const additions: Row[] = [];
    for (let index = carousels.length; index < required; index += 1) {
      additions.push({
        id: needsAboutTwo && independentRecord ? "about-community-carousel" : index === 0 ? "about-promo-carousel" : "about-community-carousel",
        type: "community_carousel",
        title: needsAboutTwo && independentRecord ? "Our Community" : index === 0 ? "Community Spotlight" : "Our Community",
        body: "",
        is_visible: true,
        scroll_direction: needsAboutTwo && independentRecord ? "forward" : index === 0 ? "reverse" : "forward",
        cards: [],
      });
    }
    return { ...row, sections: [...sections, ...additions] };
  }
  return row;
}

export default function AdminContentManager({
  acceptanceAccessToken,
  initialRecordId,
}: {
  acceptanceAccessToken?: string;
  initialRecordId?: string;
} = {}) {
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
  const [publicationByPage, setPublicationByPage] = useState<Record<string, PublicationSummary>>({});
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useAdminListScrollRestoration(!loading);

  async function authHeaders() {
    if (acceptanceAccessToken) {
      return {
        Authorization: `Bearer ${acceptanceAccessToken}`,
        "Content-Type": "application/json",
      };
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Your admin session has expired. Please sign in again.");
    return { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  }

  async function loadContent(selectFirst = true) {
    try {
      const response = await fetch("/api/admin/content", { headers: await authHeaders(), cache: "no-store" });
      const body = await readApiResponse(response, "Unable to load content.");
      if (!response.ok || body.error) throw new Error(body.error || "Unable to load content");
      const loadedPages = asRows(body.pages);
      const loadedPosts = asRows(body.posts);
      const loadedStyles = asRows(body.masterStyles);
      const loadedCategories = asRows(body.serviceCategories);
      const loadedGroups = asRows(body.serviceGroups);
      const loadedAddons = asRows(body.serviceAddons);
      const loadedTargets = asRows(body.linkTargets);
      const loadedPublication = body.publicationByPage && typeof body.publicationByPage === "object" && !Array.isArray(body.publicationByPage) ? body.publicationByPage as Record<string, PublicationSummary> : {};
      setPages(loadedPages);
      setPosts(loadedPosts);
      setMasterStyles(loadedStyles);
      setServiceCategories(loadedCategories);
      setServiceGroups(loadedGroups);
      setServiceAddons(loadedAddons);
      setLinkTargets(loadedTargets);
      setPublicationByPage(loadedPublication);
      if (selectFirst) {
        const visiblePages = loadedPages.filter((item: Row) => !hiddenSlugs.has(item.slug) && !sectionPageSlugs.has(String(item.slug)));
        setPage(recordPage(loadedPages, initialRecordId) || visiblePages[0] || null);
        setPost(recordPost(loadedPosts, initialRecordId));
        setMasterStyle(loadedStyles[0] || null);
      }
      return { pages: loadedPages, posts: loadedPosts, masterStyles: loadedStyles, serviceCategories: loadedCategories, serviceGroups: loadedGroups, serviceAddons: loadedAddons, linkTargets: loadedTargets, publicationByPage: loadedPublication };
    } catch (error) {
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
        const headers = await authHeaders();
        const response = await fetch("/api/admin/content", { headers, cache: "no-store" });
        const body = await readApiResponse(response, "Unable to load content.");
        if (!response.ok || body.error) throw new Error(body.error || "Unable to load content");
        if (!active) return;
        const loadedPages = asRows(body.pages); const loadedPosts = asRows(body.posts); const loadedStyles = asRows(body.masterStyles); const loadedCategories = asRows(body.serviceCategories); const loadedGroups = asRows(body.serviceGroups); const loadedAddons = asRows(body.serviceAddons); const loadedTargets = asRows(body.linkTargets); const loadedPublication = body.publicationByPage && typeof body.publicationByPage === "object" && !Array.isArray(body.publicationByPage) ? body.publicationByPage as Record<string, PublicationSummary> : {};
        setPages(loadedPages); setPosts(loadedPosts); setMasterStyles(loadedStyles); setServiceCategories(loadedCategories); setServiceGroups(loadedGroups); setServiceAddons(loadedAddons); setLinkTargets(loadedTargets); setPublicationByPage(loadedPublication);
        const visiblePages = loadedPages.filter((item: Row) => !hiddenSlugs.has(item.slug) && !sectionPageSlugs.has(String(item.slug)));
        setPage(recordPage(loadedPages, initialRecordId) || visiblePages[0] || null); setPost(recordPost(loadedPosts, initialRecordId)); setMasterStyle(loadedStyles[0] || null);
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "Unable to load content");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [acceptanceAccessToken, initialRecordId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!page) return;
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publicationAction = String(submitter?.value || form.get("publication_action") || "");
    const formText = (name: string, fallback: unknown) =>
      form.has(name) ? String(form.get(name) || "") : String(fallback || "");
    const sections = asRows(page.sections).map((section: Row, index: number) => ({
      ...section,
      title: formText(`section_title_${index}`, section.title),
      body: formText(`section_body_${index}`, section.body),
      cta_label: formText(`section_cta_label_${index}`, section.cta_label),
      cta_href: formText(`section_cta_href_${index}`, section.cta_href),
    }));
    const labels = { ...(page.labels || {}), ...Object.fromEntries((labelSlots[page.slug] || []).filter(([key]) => form.has(`label_${key}`)).map(([key]) => [key, String(form.get(`label_${key}`) || "").trim()])) };
    const payload = {
      ...page,
      expected_updated_at: page.updated_at || "",
      title: formText("title", page.title), eyebrow: formText("eyebrow", page.eyebrow), hero_title: formText("hero_title", page.hero_title),
      hero_subtitle: formText("hero_subtitle", page.hero_subtitle), seo_title: formText("seo_title", page.seo_title),
      seo_description: formText("seo_description", page.seo_description), status: formText("status", page.status || "Draft"), sections, labels,
      scheduled_publish_at: formText("scheduled_publish_at", page.scheduled_publish_at),
      hero_position_x: Number(page.hero_position_x ?? 50), hero_position_y: Number(page.hero_position_y ?? 50), hero_zoom: Number(page.hero_zoom ?? 1),
      updated_at: new Date().toISOString(),
    };
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/admin/content", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ type: "page", payload, action: publicationAction || undefined }) });
      const body = await readApiResponse(response, "Page save failed.");
      if (!response.ok || body.error) throw new Error(body.error || "Page save failed");
      const data = body.data as Row | undefined;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(body.error || "Page save failed.");
      }
      const reloaded = await loadContent(false);
      const persisted = reloaded.pages.find((row) => row.slug === data.slug);
      if (!persisted || persisted.updated_at !== data.updated_at) throw new Error("The page was sent but could not be verified after saving.");
      const verifiedPublication = reloaded.publicationByPage[String(data.slug)];
      if (verifiedPublication) {
        setPublicationByPage((current) => ({ ...current, [String(data.slug)]: verifiedPublication }));
      }
    setPage(data);
    setPages(rows => rows.some(row => row.slug === data.slug) ? rows.map(row => row.slug === data.slug ? data : row) : [...rows, data]);
      const persistedStatus = String(persisted.status || data.status || "Draft");
      setNotice(persistedStatus === "Published"
        ? "Page saved, verified in Supabase, published, and public caches were refreshed."
        : persistedStatus === "Scheduled"
          ? `Page saved and scheduled for ${displayTimestamp(persisted.scheduled_publish_at)}.`
          : verifiedPublication?.public_version
            ? `Page draft saved and verified in Supabase. The previously published version from ${displayTimestamp(verifiedPublication.public_version)} remains live.`
            : `Page saved and verified in Supabase as ${persistedStatus}. It is not publicly visible.`);
    } catch (error) {
      setNotice(error instanceof Error ? `Save failed: ${error.message}` : "Page save failed");
    } finally { setSaving(false); }
  }

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post) return;
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publicationAction = String(submitter?.value || form.get("publication_action") || "");
    const payload = {
      ...post,
      expected_updated_at: post.updated_at || "",
      slug: form.get("slug"), title: form.get("title"), excerpt: form.get("excerpt"),
      category: form.get("category"), content: form.get("content"), status: form.get("status"),
      featured: form.get("featured") === "on", scheduled_publish_at: form.get("scheduled_publish_at") || post.scheduled_publish_at || null,
      updated_at: new Date().toISOString(),
    };
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/admin/content", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ type: "post", payload, action: publicationAction || undefined }) });
      const body = await readApiResponse(response, "Post save failed.");
      if (!response.ok || body.error) throw new Error(body.error || "Post save failed");
      const data = body.data as Row | undefined;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(body.error || "Post save failed.");
      }
      const reloaded = await loadContent(false);
      const persisted = reloaded.posts.find((row) => row.id === data.id);
      if (!persisted || persisted.updated_at !== data.updated_at) throw new Error("The post was sent but could not be verified after saving.");
    setPost(data);
    setPosts(rows => rows.some(row => row.id === data.id) ? rows.map(row => row.id === data.id ? data : row) : [data, ...rows]);
      const persistedStatus = String(persisted.status || data.status || "Draft");
      setNotice(persistedStatus === "Published"
        ? "Blog post published and verified in Supabase."
        : persistedStatus === "Scheduled"
          ? `Blog post saved and scheduled for ${displayTimestamp(persisted.scheduled_publish_at)}.`
          : persisted.publication_state === "Published" && persisted.published_payload
            ? "Blog post draft saved and verified. The previously published version remains live."
            : `Blog post saved and verified as ${persistedStatus}. It is not publicly visible.`);
    } catch (error) {
      setNotice(error instanceof Error ? `Save failed: ${error.message}` : "Post save failed");
    } finally { setSaving(false); }
  }

  async function removePost() {
    if (!post?.id || !confirm("Delete this blog post?")) return;
    try {
      const response = await fetch("/api/admin/content", { method: "DELETE", headers: await authHeaders(), body: JSON.stringify({ id: post.id }) });
      const body = await readApiResponse(response, "Delete failed.");
      if (!response.ok || body.error) throw new Error(body.error || "Delete failed");
      setPosts(rows => rows.filter(row => row.id !== post.id));
      setPost(null);
      setNotice("Blog post deleted.");
    } catch (error) {
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

  const additionalLegalSlugs = pages
    .filter((item) => item.page_group === "Legal" && item.slug !== "legal")
    .map((item) => String(item.slug));
  const editableLegalSlugs = [...new Set([...legalSlugs, ...additionalLegalSlugs])];
  const allSlugs = [...new Set([...defaultSlugs, ...editableLegalSlugs, ...pages.map(item => item.slug)])].filter(slug => !hiddenSlugs.has(slug));
  const contentSlugs = allSlugs.filter((slug) => !editableLegalSlugs.includes(slug));
  const visibleSlugs = tab === "legal" ? editableLegalSlugs : contentSlugs;

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

  if (!acceptanceAccessToken && !initialRecordId) {
    return <ContentManagerLanding pages={pages} posts={posts} publicationByPage={publicationByPage} />;
  }

  if (initialRecordId) {
    return <ContentRecordWorkspace
      record={parseContentRecord(initialRecordId)}
      page={page}
      post={post}
      setPage={setPage}
      setPost={setPost}
      savePage={savePage}
      savePost={savePost}
      removePost={removePost}
      linkTargets={linkTargets}
      publicationByPage={publicationByPage}
      notice={notice}
      saving={saving}
      dismissNotice={() => setNotice("")}
    />;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-plum/10 bg-white p-1">
          {(["pages", "legal", "blog", "styles"] as const).map(value => <button key={value} onClick={() => switchTab(value)} className={`rounded-md px-5 py-2 text-xs font-bold ${tab === value ? "bg-magenta text-white" : ""}`}>{value === "pages" ? "Pages" : value === "legal" ? "Legal" : value === "blog" ? "Blog" : "Service Catalog"}</button>)}
        </div>
        {tab !== "legal" && tab !== "styles" ? <button onClick={createNew} className="flex items-center gap-2 rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white"><Plus size={16} />Create {tab === "pages" ? "Page" : "Post"}</button> : null}
      </div>
      <ActionToast message={notice} onDismiss={() => setNotice("")} />
      {saving ? <p className="mb-4 text-xs font-bold text-magenta">Saving and verifying in Supabase…</p> : null}
      {tab === "pages" || tab === "legal" ? (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[250px_1fr]">
          <aside className="rounded-xl border border-plum/10 bg-white p-3">
            <h2 className="px-2 py-2 font-serif text-xl text-plum">{tab === "legal" ? "Legal Pages" : "Public Pages"}</h2>
            {visibleSlugs.map(slug => <button key={slug} onClick={() => setPage(pages.find(item => item.slug === slug) || { slug, title: slug.replaceAll("-", " "), hero_title: slug.replaceAll("-", " "), hero_subtitle: "", sections: tab === "legal" ? [{ type: "text", title: "", body: "", is_visible: true }] : [], page_group: tab === "legal" ? "Legal" : "Content", status: tab === "legal" ? "Published" : "Draft", is_enabled: true })} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${page?.slug === slug ? "bg-blush text-magenta" : ""}`}><FileText size={15} />{slug}</button>)}
          </aside>
          {page ? tab === "legal" ? <LegalPageEditor key={page.slug} page={page} setPage={setPage} save={savePage} /> : <PageEditor key={page.slug} page={page} setPage={setPage} save={savePage} linkTargets={linkTargets} /> : null}
        </div>
      ) : tab === "blog" ? (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border border-plum/10 bg-white p-3">{posts.map(item => <button key={item.id} onClick={() => setPost(item)} className={`mb-1 w-full rounded-lg p-3 text-left ${post?.id === item.id ? "bg-blush" : ""}`}><b className="block text-xs text-plum">{item.title}</b><small>{item.status} · {item.category}</small></button>)}</aside>
          {post ? <PostEditor key={post.id || "new"} post={post} setPost={setPost} save={savePost} remove={removePost} saving={saving} /> : null}
        </div>
      ) : (
        <ServiceCatalogManager categories={serviceCategories} groups={serviceGroups} addons={serviceAddons} services={masterStyles} initialService={masterStyle} setInitialService={setMasterStyle} authHeaders={authHeaders} reload={loadContent} setNotice={setNotice} saving={saving} setSaving={setSaving} />
      )}
    </div>
  );
}

type ContentSectionDefinition = {
  id: string;
  title: string;
  description: string;
  kind: "hero" | "section" | "additional" | "settings" | "system";
  sectionType?: string;
  sectionOccurrence?: number;
  manageHref?: string;
};

const homeContentSections: ContentSectionDefinition[] = [
  { id: "hero-promotion-carousel", title: "Hero Promotion Carousel", description: "Published promotion media, destinations, schedules, targeting, and display order.", kind: "section", sectionType: "promo_rail" },
  { id: "salons-near-you", title: "Salons Near You", description: "Live location-aware salon ranking. Customer distance is calculated from the shared discovery engine.", kind: "system", manageHref: "/admin/salons" },
  { id: "featured-salons", title: "Featured Salons", description: "Eligible paid and complimentary salon placements from Marketing & Promotions.", kind: "system", manageHref: "/admin/marketing" },
  { id: "trending-picks", title: "Trending Picks", description: "Published trend placements linked to real styles and salon destinations.", kind: "system", manageHref: "/admin/marketing" },
  { id: "featured-products", title: "Featured Products", description: "Visible in-salon products from eligible salon profiles.", kind: "system", manageHref: "/admin/marketing" },
  { id: "announcement-banner", title: "Announcement Banner", description: "Optional homepage announcement with one clear destination.", kind: "section", sectionType: "banner" },
  { id: "additional-content-sections", title: "Additional Content Sections", description: "Reorder and edit all other homepage editorial sections.", kind: "additional" },
  { id: "page-settings", title: "Page Settings", description: "Publication status, visibility, SEO title, and search description.", kind: "settings" },
];

const aboutContentSections: ContentSectionDefinition[] = [
  { id: "hero-introduction", title: "About Hero & Introduction", description: "About-page hero, introduction, imagery, and the mobile Read more copy.", kind: "hero" },
  { id: "promotional-carousel-one", title: "Promotional Carousel One", description: "First automatic About carousel. It moves independently in the reverse direction.", kind: "section", sectionType: "community_carousel", sectionOccurrence: 0 },
  { id: "promotional-carousel-two", title: "Promotional Carousel Two", description: "Second automatic About carousel. It moves independently in the forward direction.", kind: "section", sectionType: "community_carousel", sectionOccurrence: 1 },
  { id: "additional-about-content", title: "Additional About Content", description: "The remaining About sections in their public display order.", kind: "additional" },
  { id: "page-settings", title: "Page Settings", description: "Publication status, visibility, SEO title, and search description.", kind: "settings" },
];

const genericContentSections: ContentSectionDefinition[] = [
  { id: "hero-introduction", title: "Hero & Introduction", description: "Page heading, introduction, and approved media.", kind: "hero" },
  { id: "additional-content-sections", title: "Content Sections", description: "Visible editorial sections in public display order.", kind: "additional" },
  { id: "page-settings", title: "Page Settings", description: "Publication status, visibility, SEO title, and search description.", kind: "settings" },
];

function pageDefinitions(slug: string) {
  if (slug === "home") return homeContentSections;
  if (slug === "about") return aboutContentSections;
  if (slug === "about-carousel-one") return [aboutContentSections[1]];
  if (slug === "about-carousel-two") return [aboutContentSections[2]];
  return genericContentSections;
}

function displayTimestamp(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "Not yet";
}

function sectionIndexFor(page: Row, definition: ContentSectionDefinition) {
  if (!definition.sectionType) return -1;
  const matching = asRows(page.sections)
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.type === definition.sectionType);
  const occurrence = sectionPageSlugs.has(String(page.slug)) ? 0 : definition.sectionOccurrence || 0;
  return matching[occurrence]?.index ?? -1;
}

function contentSectionState(page: Row, definition: ContentSectionDefinition) {
  const independent = page._section_records?.[definition.id] as Row | null | undefined;
  if (independent) {
    const section = asRows(independent.sections)[0];
    const cards = asRows(section?.cards);
    return {
      visible: independent.is_enabled !== false && section?.is_visible !== false,
      count: `${cards.length || (section ? 1 : 0)} item${cards.length === 1 ? "" : "s"}`,
      state: String(independent.status || "Draft"),
    };
  }
  const publication = String(page.status || "Draft");
  if (definition.kind === "system") return { visible: page.is_enabled !== false, count: "Live source", state: publication };
  if (definition.kind === "settings" || definition.kind === "hero") return { visible: page.is_enabled !== false, count: definition.kind === "hero" ? "1 hero" : "Page-wide", state: publication };
  if (definition.kind === "additional") {
    const excluded = page.slug === "home" ? new Set(["promo_rail", "banner"]) : page.slug === "about" ? new Set(["community_carousel"]) : new Set<string>();
    const sections = asRows(page.sections).filter((section) => !excluded.has(String(section.type)));
    return { visible: sections.some((section) => section.is_visible !== false), count: `${sections.length} item${sections.length === 1 ? "" : "s"}`, state: publication };
  }
  const index = sectionIndexFor(page, definition);
  const section = index >= 0 ? asRows(page.sections)[index] : null;
  const cards = asRows(section?.cards);
  return { visible: Boolean(section) && section?.is_visible !== false, count: `${cards.length || (section ? 1 : 0)} item${cards.length === 1 ? "" : "s"}`, state: section ? publication : "Not configured" };
}

function ContentManagerLanding({ pages, posts, publicationByPage }: { pages: Row[]; posts: Row[]; publicationByPage: Record<string, PublicationSummary> }) {
  const visiblePages = pages.filter((item) => !hiddenSlugs.has(String(item.slug)) && !sectionPageSlugs.has(String(item.slug)) && item.page_group !== "Legal");
  const legalPages = pages.filter((item) => !hiddenSlugs.has(String(item.slug)) && item.page_group === "Legal");
  const publishedPosts = posts.filter((item) => resolvedPublicationUi(item).isPublic).length;
  return <div className="space-y-6" data-testid="content-manager-overview">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-magenta">Public content</p><h2 className="mt-1 font-serif text-3xl text-plum">Content Management</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">Open one public page, then edit one section at a time. Saved and published state is shown before you enter an editor.</p></div>
      <Link href={adminContentHref("blog-new")} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white"><Plus size={15}/>New blog post</Link>
    </header>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visiblePages.map((item) => {
        const summary = publicationByPage[String(item.slug)] || {};
        const publication = resolvedPublicationUi(item, summary);
        return <article key={item.slug} className="rounded-2xl border border-plum/10 bg-white p-5 shadow-[0_12px_30px_rgba(13,17,20,.04)]">
          <div className="flex items-start justify-between gap-4"><div><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${publication.isPublic ? "bg-green-100 gc-text-success" : "bg-amber/20 text-plum"}`}>{publication.label}</span><h3 className="mt-3 font-serif text-2xl text-plum">{item.title || item.slug}</h3></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${publication.isPublic ? "bg-blush text-magenta" : "bg-red-50 gc-text-danger"}`}>{publication.isPublic ? "Public" : "Not public"}</span></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[10px] text-ink/55"><div><dt className="font-bold text-plum">Last saved</dt><dd className="mt-1">{displayTimestamp(summary.saved_version || item.updated_at)}</dd></div><div><dt className="font-bold text-plum">Last published</dt><dd className="mt-1">{displayTimestamp(summary.public_version)}</dd></div><div><dt className="font-bold text-plum">Sections</dt><dd className="mt-1">{asRows(item.sections).length}</dd></div><div><dt className="font-bold text-plum">Public cards</dt><dd className="mt-1">{summary.public_card_count ?? "—"}</dd></div></dl>
          <div className="mt-5 flex gap-2"><Link href={adminContentHref(`page-${item.slug}`)} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg bg-plum px-4 text-xs font-bold text-white">Open page</Link><Link href={publicPageHref(String(item.slug))} target="_blank" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum"><Eye size={14}/>Preview</Link></div>
        </article>;
      })}
    </section>
    {legalPages.length ? <section className="rounded-2xl border border-plum/10 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-2xl text-plum">Legal &amp; policies</h3><p className="mt-1 text-xs text-ink/55">Each legal page has the same explicit draft, schedule, publish, hide, and archive workflow.</p></div><Link href="/legal" target="_blank" className="text-xs font-bold text-magenta">Preview policies →</Link></div><div className="mt-4 grid gap-2 md:grid-cols-2">{legalPages.map((item) => { const publication = resolvedPublicationUi(item, publicationByPage[String(item.slug)] || {}); return <Link key={item.slug} href={adminContentHref(`page-${item.slug}`)} className="flex items-center justify-between gap-3 rounded-xl border border-plum/10 p-4 text-xs"><span><b className="block text-plum">{item.title || item.slug}</b><small className="mt-1 block text-ink/50">{publication.label}</small></span><span className="font-bold text-magenta">Edit</span></Link>; })}</div></section> : null}
    <section className="rounded-2xl border border-plum/10 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-2xl text-plum">Blog posts</h3><p className="mt-1 text-xs text-ink/55">{publishedPosts} public · {posts.length - publishedPosts} not public</p></div><Link href="/blog" target="_blank" className="text-xs font-bold text-magenta">Preview blog →</Link></div><div className="mt-4 grid gap-2 md:grid-cols-2">{posts.slice(0, 8).map((item) => { const publication = resolvedPublicationUi(item); return <Link key={item.id || item.slug} href={adminContentHref(`blog-${item.id || item.slug}`)} className="flex items-center justify-between gap-3 rounded-xl border border-plum/10 p-4 text-xs"><span><b className="block text-plum">{item.title}</b><small className="mt-1 block text-ink/50">{publication.label} · {item.category}</small></span><span className="font-bold text-magenta">Edit</span></Link>; })}</div></section>
  </div>;
}

function ContentRecordWorkspace({ record, page, post, setPage, setPost, savePage, savePost, removePost, linkTargets, publicationByPage, notice, saving, dismissNotice }: {
  record: ContentRecord;
  page: Row | null;
  post: Row | null;
  setPage: React.Dispatch<React.SetStateAction<Row | null>>;
  setPost: React.Dispatch<React.SetStateAction<Row | null>>;
  savePage: (event: FormEvent<HTMLFormElement>) => void;
  savePost: (event: FormEvent<HTMLFormElement>) => void;
  removePost: () => void;
  linkTargets: Row[];
  publicationByPage: Record<string, PublicationSummary>;
  notice: string;
  saving: boolean;
  dismissNotice: () => void;
}) {
  if (record.kind === "blog") return <div><WorkspaceHeader title={post?.id ? "Edit blog post" : "Create blog post"} publicHref={post?.slug && post.id ? `/blog/${post.slug}` : undefined}/><ActionToast message={notice} onDismiss={dismissNotice}/>{post ? <PostEditor post={post} setPost={setPost} save={savePost} remove={removePost} saving={saving}/> : <MissingRecord/>}</div>;
  if (record.kind !== "page" || !page) return <MissingRecord/>;
  const prepared = ensureEditorSection(page, record.editor);
  const summary = publicationByPage[String(prepared.slug)] || {};
  if (!record.editor) return <PageSectionOverview page={prepared} summary={summary} publicationByPage={publicationByPage}/>;
  return <FocusedPageEditor page={prepared} parentSlug={record.slug} editorId={record.editor} setPage={setPage} save={savePage} linkTargets={linkTargets} summary={summary} notice={notice} saving={saving} dismissNotice={dismissNotice}/>;
}

function MissingRecord() {
  return <div className="rounded-2xl border border-dashed border-plum/20 bg-white p-10 text-center"><h2 className="font-serif text-2xl text-plum">Content record unavailable</h2><p className="mt-2 text-sm text-ink/55">This record may have been removed or is outside your access.</p><Link href="/admin/content" className="mt-5 inline-flex rounded-lg bg-plum px-5 py-3 text-xs font-bold text-white">Back to Content Management</Link></div>;
}

function WorkspaceHeader({ title, publicHref, backHref = "/admin/content" }: { title: string; publicHref?: string; backHref?: string }) {
  return <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link href={backHref} aria-label="Back to previous content workspace" className="rounded-lg border border-plum/15 bg-white p-2.5 text-plum"><ArrowLeft size={17}/></Link><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-magenta">Content Management</p><h2 className="font-serif text-3xl text-plum">{title}</h2></div></div>{publicHref ? <Link href={publicHref} target="_blank" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 bg-white px-4 text-xs font-bold text-plum"><Eye size={14}/>Preview live</Link> : null}</header>;
}

function PageSectionOverview({ page, summary, publicationByPage }: { page: Row; summary: PublicationSummary; publicationByPage: Record<string, PublicationSummary> }) {
  return <div data-testid={`content-page-overview-${page.slug}`}><WorkspaceHeader title={page.title || page.slug} publicHref={publicPageHref(String(page.slug))}/><div className="mb-5 grid gap-3 rounded-2xl border border-plum/10 bg-white p-4 text-xs sm:grid-cols-4"><PublicationFact label="Saved version" value={displayTimestamp(summary.saved_version || page.updated_at)}/><PublicationFact label="Public version" value={displayTimestamp(summary.public_version)}/><PublicationFact label="Public cards" value={String(summary.public_card_count ?? "—")}/><PublicationFact label="Editorial fallback" value={String(summary.fallback_count ?? "—")}/></div><div className="space-y-3">{pageDefinitions(String(page.slug)).map((definition, index) => {
    const independentSlug = definition.id === "promotional-carousel-one" ? "about-carousel-one" : definition.id === "promotional-carousel-two" ? "about-carousel-two" : "";
    const record = independentSlug ? page._section_records?.[definition.id] || page : page;
    const draftState = contentSectionState(record, definition);
    const publicRecord = resolvedPublicSnapshot(record);
    const publicState = publicRecord
      ? contentSectionState(publicRecord, definition)
      : { visible: false, count: "0 items", state: "Not published" };
    const timestamps = independentSlug ? publicationByPage[independentSlug] || {} : summary;
    const publication = resolvedPublicationUi(record, timestamps);
    const sourceSections = asRows(record.sections);
    const sectionIndex = sectionIndexFor(record, definition);
    const relevantSection = sectionIndex >= 0 ? sourceSections[sectionIndex] : definition.kind === "additional" ? sourceSections.find((item) => !["promo_rail", "banner", "community_carousel"].includes(String(item.type))) : null;
    const previewCard = asRows(relevantSection?.cards)[0];
    const previewMedia = definition.kind === "hero" ? record.hero_image_url : previewCard?.media_url || relevantSection?.image_url;
    const previewText = definition.kind === "hero" ? record.hero_title : relevantSection?.title || definition.description;
    const publiclyVisible = publication.isPublic && publicState.visible;
    return <article key={definition.id} className="grid gap-4 rounded-2xl border border-plum/10 bg-white p-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-plum px-2 py-1 text-[9px] font-bold text-white">{index + 1}</span><h3 className="font-serif text-xl text-plum">{definition.title}</h3><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${publiclyVisible ? "bg-green-100 gc-text-success" : "bg-red-50 gc-text-danger"}`}>Public: {publiclyVisible ? "Visible" : "Not visible"}</span><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${draftState.visible ? "bg-blush text-magenta" : "bg-amber/20 text-plum"}`}>Draft: {draftState.visible ? "Visible" : "Hidden"}</span></div><p className="mt-2 text-xs leading-5 text-ink/55">{definition.description}</p><p className="mt-3 text-[10px] text-ink/50">{publication.label} · Draft {draftState.count} · Public {publicState.count} · Fixed public position {index + 1}</p><dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[9px] text-ink/50"><div><dt className="inline font-bold text-plum">Last saved: </dt><dd className="inline">{displayTimestamp(timestamps.saved_version || record.updated_at)}</dd></div><div><dt className="inline font-bold text-plum">Last published: </dt><dd className="inline">{displayTimestamp(timestamps.public_version)}</dd></div></dl></div><div className="flex min-h-16 items-center gap-3 rounded-xl bg-cream/70 p-2">{previewMedia ? <SafeImage src={String(previewMedia)} fallbackSrc="/images/hero-braids.jpg" alt="" className="h-12 w-14 shrink-0 rounded-lg object-cover"/> : <span className="grid h-12 w-14 shrink-0 place-items-center rounded-lg bg-blush text-[9px] font-bold text-plum">Saved preview</span>}<p className="line-clamp-3 text-[10px] leading-4 text-ink/60">{String(previewText || "Saved database content")}</p></div><div className="flex flex-wrap gap-2"><Link href={adminContentHref(`page-${page.slug}--${definition.id}`)} className="inline-flex min-h-10 items-center rounded-lg bg-magenta px-4 text-xs font-bold text-white">Edit</Link><Link href={publicPageHref(String(page.slug))} target="_blank" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum"><Eye size={14}/>Preview</Link></div></article>;
  })}</div></div>;
}

function PublicationFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-cream/70 p-3"><b className="block text-plum">{label}</b><span className="mt-1 block text-ink/55">{value}</span></div>;
}

function PublicationActions({ status, scheduledAt, saving, subject, hasPublicVersion = false }: { status: string; scheduledAt?: unknown; saving: boolean; subject: "Page" | "Blog post"; hasPublicVersion?: boolean }) {
  const normalized = String(status || "Draft");
  const archived = normalized === "Archived";
  const publicOrScheduled = normalized === "Published" || normalized === "Scheduled" || hasPublicVersion;
  return <div className="flex flex-1 flex-wrap items-end justify-end gap-2">
    <label className="min-w-56 text-[10px] font-bold text-plum">Schedule date and time
      <input name="scheduled_publish_at" type="datetime-local" defaultValue={String(scheduledAt || "").slice(0, 16)} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal text-ink"/>
    </label>
    {archived ? <button type="submit" value="restore" disabled={saving} className="min-h-10 rounded-lg border border-plum/20 px-4 text-xs font-bold text-plum gc-disabled-control">Restore as draft</button> : <button type="submit" value="save_draft" disabled={saving} className="min-h-10 rounded-lg border border-plum/20 px-4 text-xs font-bold text-plum gc-disabled-control">Save draft</button>}
    <button type="submit" value="schedule" disabled={saving || archived} className="min-h-10 rounded-lg border border-magenta/30 px-4 text-xs font-bold text-magenta gc-disabled-control">Schedule</button>
    <button type="submit" value="publish" disabled={saving || archived} className="min-h-10 rounded-lg bg-magenta px-5 text-xs font-bold text-white gc-disabled-control">{saving ? "Saving and verifying…" : `Publish ${subject.toLowerCase()}`}</button>
    {publicOrScheduled ? <button type="submit" value="unpublish" disabled={saving} className="min-h-10 rounded-lg border border-amber/50 px-4 text-xs font-bold text-plum gc-disabled-control">Unpublish</button> : null}
    {!archived ? <button type="submit" value="archive" disabled={saving} className="min-h-10 rounded-lg border border-red-200 px-4 text-xs font-bold gc-text-danger gc-disabled-control">Archive</button> : null}
  </div>;
}

function FocusedPageEditor({ page, parentSlug, editorId, setPage, save, linkTargets, summary, notice, saving, dismissNotice }: {
  page: Row;
  parentSlug: string;
  editorId: string;
  setPage: React.Dispatch<React.SetStateAction<Row | null>>;
  save: (event: FormEvent<HTMLFormElement>) => void;
  linkTargets: Row[];
  summary: PublicationSummary;
  notice: string;
  saving: boolean;
  dismissNotice: () => void;
}) {
  const definition = pageDefinitions(String(page.slug)).find((item) => item.id === editorId);
  if (!definition) return <MissingRecord/>;
  const publication = resolvedPublicationUi(page, summary);
  const sectionIndex = sectionIndexFor(page, definition);
  const sections = asRows(page.sections);
  const excluded = page.slug === "home" ? new Set(["promo_rail", "banner"]) : page.slug === "about" ? new Set(["community_carousel"]) : new Set<string>();
  const additionalIndexes = sections.map((section, index) => ({ section, index })).filter(({ section }) => !excluded.has(String(section.type))).map(({ index }) => index);
  const updateSection = (index: number, next: Row) => setPage((current) => {
    const currentSections = asRows(current?.sections);
    const identity = String(next.id || "");
    const existingIndex = identity
      ? currentSections.findIndex((item) => String(item.id || "") === identity)
      : index < currentSections.length
        ? index
        : -1;
    if (existingIndex < 0) {
      return { ...current, sections: [...currentSections, next] };
    }
    return {
      ...current,
      sections: currentSections.map((item, itemIndex) => itemIndex === existingIndex ? next : item),
    };
  });
  const moveSection = (index: number, direction: -1 | 1) => setPage((current) => { const next = [...asRows(current?.sections)]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return { ...current, sections: next }; });
  const parentHref = adminContentHref(`page-${parentSlug}`);
  if (definition.kind === "system") return <div><WorkspaceHeader title={definition.title} publicHref="/" backHref={parentHref}/><section className="rounded-2xl border border-plum/10 bg-white p-6"><h3 className="font-serif text-2xl text-plum">Live database source</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">{definition.description} This section is not duplicated in page JSON; it reads eligible live records so edits remain consistent everywhere.</p><Link href={definition.manageHref || "/admin/content"} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-magenta px-5 text-xs font-bold text-white">Open source manager</Link></section></div>;
  return <div><WorkspaceHeader title={definition.title} publicHref={publicPageHref(String(page.slug))} backHref={parentHref}/><ActionToast message={notice} onDismiss={dismissNotice}/><form onSubmit={save} className="space-y-5" data-testid={`content-editor-${editorId}`}>
    <section className="rounded-2xl border border-plum/10 bg-white p-5">
      {definition.kind === "hero" ? <><div className="grid gap-4 lg:grid-cols-2"><Field required label="Page title" name="title" value={page.title}/><Field label="Eyebrow" name="eyebrow" value={page.eyebrow}/><div className="lg:col-span-2"><Field required label="Hero heading" name="hero_title" value={page.hero_title}/></div><div className="lg:col-span-2"><Area label="Hero introduction" name="hero_subtitle" value={page.hero_subtitle} rows={5}/></div><ImageUpload bucket="content-media" preset="content" value={page.hero_image_url} onChange={(value) => setPage((current) => ({ ...current, hero_image_url: value }))} label="Hero image" folder={String(page.slug)}/></div><HeroImageFraming imageUrl={page.hero_image_url} positionX={Number(page.hero_position_x ?? 50)} positionY={Number(page.hero_position_y ?? 50)} zoom={Number(page.hero_zoom ?? 1)} onChange={({ positionX, positionY, zoom }) => setPage((current) => ({ ...current, hero_position_x: positionX, hero_position_y: positionY, hero_zoom: zoom }))}/>{(labelSlots[page.slug] || []).length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{(labelSlots[page.slug] || []).map(([key, label]) => <Field key={key} label={label} name={`label_${key}`} value={page.labels?.[key]}/>)}</div> : null}</> : null}
      {definition.kind === "settings" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="SEO title" name="seo_title" value={page.seo_title}/><Field label="SEO description" name="seo_description" value={page.seo_description}/><div className="rounded-lg border border-plum/10 p-3 text-xs"><b className="text-plum">Current state: {String(page.status || "Draft")}</b><p className="mt-1 leading-5 text-ink/50">Visibility changes only through the publication actions below, so a draft cannot be mistaken for live content.</p></div><div className="rounded-lg border border-plum/10 p-3 text-xs"><b className="text-plum">Public visibility</b><p className="mt-1 leading-5 text-ink/50">{page.is_enabled !== false && ["Published", "Scheduled"].includes(String(page.status)) ? "Enabled when the publication date is due." : "Not visible on the public site."}</p></div></div> : null}
      {definition.kind === "section" && sectionIndex >= 0 ? <SectionEditor section={sections[sectionIndex]} index={sectionIndex} sectionCount={sections.length} linkTargets={linkTargets} move={(direction) => moveSection(sectionIndex, direction)} update={(next) => updateSection(sectionIndex, next)} remove={() => undefined} allowRemove={false}/> : null}
      {definition.kind === "additional" ? <div className="space-y-4">{additionalIndexes.map((index) => <SectionEditor key={sections[index].id || index} section={sections[index]} index={index} sectionCount={sections.length} linkTargets={linkTargets} move={(direction) => moveSection(index, direction)} update={(next) => updateSection(index, next)} remove={() => setPage((current) => ({ ...current, sections: asRows(current?.sections).filter((_, itemIndex) => itemIndex !== index) }))}/>)}<button type="button" onClick={() => setPage((current) => ({ ...current, sections: [...asRows(current?.sections), { id: crypto.randomUUID(), type: "card_grid", title: "New Section", body: "", is_visible: true, columns: 4, cards: [] }] }))} className="text-xs font-bold text-magenta">+ Add content section</button></div> : null}
    </section>
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-plum/10 bg-white/95 p-4 shadow-xl backdrop-blur"><div className="text-[10px] text-ink/55"><b className="block text-plum">Saved: {displayTimestamp(summary.saved_version || page.updated_at)}</b><span>Public: {displayTimestamp(summary.public_version)} · {summary.public_card_count ?? 0} source card{summary.public_card_count === 1 ? "" : "s"} · {summary.fallback_count ?? 0} fallback</span><strong className={`mt-1 block ${publication.isPublic ? "gc-text-success" : "text-ink/45"}`}>{publication.label}</strong></div><PublicationActions status={String(page.status || "Draft")} scheduledAt={page.scheduled_publish_at} saving={saving} subject="Page" hasPublicVersion={publication.isPublic}/></div>
  </form></div>;
}

type CatalogKind = "service_category" | "service_group" | "master_style" | "service_addon";
type CatalogView = "active" | "archived" | "all";
type CatalogImportStatus = "create" | "restore" | "unchanged" | "conflict" | "invalid";
type CatalogImportPreviewRow = {
  source_rows: number[];
  category: string;
  category_slug: string;
  service_group: string;
  service_name: string;
  addons: string[];
  status: CatalogImportStatus;
  messages: string[];
};
type CatalogImportPreview = {
  sheet_name: string;
  ignored_columns: string[];
  rows: CatalogImportPreviewRow[];
  import_rows: Array<Omit<CatalogImportPreviewRow, "status" | "messages">>;
  summary: Record<CatalogImportStatus, number> & {
    total: number;
    importable: number;
    skipped: number;
  };
};
function filterCatalogRows(items: Row[], view: CatalogView) {
  return items.filter((item) => {
    if (view === "all") return true;
    const archived = Boolean(item.archived_at) || item.is_active === false;
    return view === "archived" ? archived : !archived;
  });
}

function CatalogSpreadsheetPanel({
  authHeaders,
  reload,
  setNotice,
  saving,
  setSaving,
}: {
  authHeaders: () => Promise<Record<string, string>>;
  reload: (selectFirst?: boolean) => Promise<{
    masterStyles: Row[];
    serviceCategories: Row[];
    serviceGroups: Row[];
    serviceAddons: Row[];
  }>;
  setNotice: (message: string) => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);

  async function downloadWorkbook(mode: "template" | "export") {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/catalog-spreadsheet?mode=${mode}`,
        { headers: await authHeaders(), cache: "no-store" },
      );
      if (!response.ok) {
        const body = await readApiResponse(
          response,
          "The catalog spreadsheet could not be downloaded.",
        );
        throw new Error(body.error || "The catalog spreadsheet could not be downloaded.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        mode === "template"
          ? "girlz-culture-platform-catalog-template.xlsx"
          : `girlz-culture-platform-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(
        mode === "template"
          ? "Blank platform catalog template downloaded."
          : "Current platform catalog exported.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setSaving(false);
    }
  }

  async function previewSpreadsheet() {
    if (!file) {
      setNotice("Choose an .xlsx or .csv catalog file first.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const headers = new Headers(await authHeaders());
      headers.delete("Content-Type");
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/catalog-spreadsheet", {
        method: "POST",
        headers,
        body: form,
      });
      const body = await readApiResponse(
        response,
        "The catalog spreadsheet could not be previewed.",
      );
      if (!response.ok) throw new Error(body.error || "Catalog preview failed.");
      const next = body as unknown as CatalogImportPreview;
      if (!next.summary || !Array.isArray(next.rows)) {
        throw new Error("The catalog preview response was incomplete.");
      }
      setPreview(next);
      setNotice(
        `Preview ready: ${next.summary.importable} row${next.summary.importable === 1 ? "" : "s"} can be imported; ${next.summary.skipped} will be skipped.`,
      );
    } catch (error) {
      setPreview(null);
      setNotice(error instanceof Error ? error.message : "Catalog preview failed.");
    } finally {
      setSaving(false);
    }
  }

  async function commitSpreadsheet() {
    if (!preview?.import_rows.length) {
      setNotice("There are no valid catalog rows to import.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/catalog-spreadsheet", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ action: "commit", rows: preview.import_rows }),
      });
      const body = await readApiResponse(
        response,
        "The catalog spreadsheet could not be imported.",
      );
      if (!response.ok) throw new Error(body.error || "Catalog import failed.");
      const result = (body.result || {}) as Row;
      await reload(false);
      setPreview(null);
      setFile(null);
      const created = Object.values((result.created || {}) as Row).reduce(
        (total: number, value) => total + Number(value || 0),
        0,
      );
      const restored = Object.values((result.restored || {}) as Row).reduce(
        (total: number, value) => total + Number(value || 0),
        0,
      );
      setNotice(
        `Catalog import completed and verified after reload: ${Number(result.rows_processed || preview.import_rows.length)} rows processed, ${created} records created, ${restored} restored.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Catalog import failed.");
    } finally {
      setSaving(false);
    }
  }

  function downloadErrorReport() {
    if (!preview) return;
    const problemRows = preview.rows.filter((row) =>
      ["conflict", "invalid"].includes(row.status),
    );
    if (!problemRows.length) {
      setNotice("This preview has no invalid or conflicting rows.");
      return;
    }
    const csvCell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["Spreadsheet rows", "Status", "Category", "Service Group", "Service Name", "Add-ons", "Reason"],
      ...problemRows.map((row) => [
        row.source_rows.join(", "),
        row.status,
        row.category,
        row.service_group,
        row.service_name,
        row.addons.join("; "),
        row.messages.join(" "),
      ]),
    ];
    const blob = new Blob(
      [rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "girlz-culture-catalog-import-errors.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const statusClass: Record<CatalogImportStatus, string> = {
    create: "bg-teal/10 text-teal",
    restore: "bg-amber/20 text-plum",
    unchanged: "bg-subtle gc-text-muted",
    conflict: "bg-red-100 gc-text-danger",
    invalid: "bg-red-100 gc-text-danger",
  };

  return (
    <section className="mb-5 rounded-xl border border-teal/20 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-teal">
            <FileSpreadsheet size={15} />
            Spreadsheet import & export
          </p>
          <h2 className="mt-2 font-serif text-2xl text-plum">
            Platform service catalog
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-ink/60">
            Import categories, service groups, service names, and category-level
            add-ons. Prices, durations, and images are intentionally excluded
            from the platform template.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void downloadWorkbook("template")}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-teal px-4 text-xs font-bold text-teal gc-disabled-control"
          >
            <Download size={15} />
            Download Template
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void downloadWorkbook("export")}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/20 px-4 text-xs font-bold text-plum gc-disabled-control"
          >
            <Download size={15} />
            Export Current Catalog
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="block text-xs font-bold text-plum">
          Excel or CSV catalog
          <input
            key={file?.name || "empty"}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
            }}
            className="mt-1 block w-full rounded-lg border border-plum/10 bg-white p-2 text-xs font-normal file:mr-3 file:rounded-md file:border-0 file:bg-teal/10 file:px-3 file:py-2 file:font-bold file:text-teal"
          />
        </label>
        <button
          type="button"
          disabled={saving || !file}
          onClick={() => void previewSpreadsheet()}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-teal px-6 text-xs font-bold text-white gc-disabled-control"
        >
          <Upload size={15} />
          Preview Import
        </button>
      </div>

      {preview ? (
        <div className="mt-5 rounded-xl border border-plum/10 bg-cream/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <b className="text-sm text-plum">
                Preview from {preview.sheet_name}
              </b>
              <p className="mt-1 text-xs text-ink/60">
                {preview.summary.create} create · {preview.summary.restore} restore
                {" · "}
                {preview.summary.unchanged} unchanged · {preview.summary.skipped} skipped
              </p>
              {preview.ignored_columns.length ? (
                <p className="mt-1 text-[10px] text-ink/50">
                  Safely ignored columns: {preview.ignored_columns.join(", ")}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.summary.skipped ? (
                <button
                  type="button"
                  onClick={downloadErrorReport}
                  className="min-h-10 rounded-lg border border-red-200 px-4 text-xs font-bold gc-text-danger"
                >
                  Download Error Report
                </button>
              ) : null}
              <button
                type="button"
                disabled={saving || !preview.summary.importable}
                onClick={() => void commitSpreadsheet()}
                className="min-h-10 rounded-lg bg-magenta px-5 text-xs font-bold text-white gc-disabled-control"
              >
                Import {preview.summary.importable} Valid Row
                {preview.summary.importable === 1 ? "" : "s"}
              </button>
            </div>
          </div>
          <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border bg-white">
            <table className="min-w-[900px] w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-plum text-white">
                <tr>
                  <th className="p-3">Rows</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Service Group</th>
                  <th className="p-3">Service Name</th>
                  <th className="p-3">Suggested Add-ons</th>
                  <th className="p-3">Preview note</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr
                    key={`${row.source_rows.join("-")}-${index}`}
                    className="border-t border-plum/10 align-top"
                  >
                    <td className="p-3">{row.source_rows.join(", ")}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-1 font-bold ${statusClass[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-plum">{row.category}</td>
                    <td className="p-3">{row.service_group || "—"}</td>
                    <td className="p-3">{row.service_name || "—"}</td>
                    <td className="max-w-[240px] p-3">{row.addons.join("; ") || "—"}</td>
                    <td className="max-w-[260px] p-3 text-ink/60">{row.messages.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 100 ? (
            <p className="mt-2 text-[10px] text-ink/50">
              All {preview.rows.length} rows are included in this scrollable preview.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ServiceCatalogManager({ categories, groups, addons, services, initialService, setInitialService, authHeaders, reload, setNotice, saving, setSaving }: {
  categories: Row[]; groups: Row[]; addons: Row[]; services: Row[]; initialService: Row | null;
  setInitialService: React.Dispatch<React.SetStateAction<Row | null>>;
  authHeaders: () => Promise<Record<string, string>>;
  reload: (selectFirst?: boolean) => Promise<{ masterStyles: Row[]; serviceCategories: Row[]; serviceGroups: Row[]; serviceAddons: Row[] }>;
  setNotice: (message: string) => void; saving: boolean; setSaving: (value: boolean) => void;
}) {
  const [kind, setKind] = useState<CatalogKind>("master_style");
  const [selected, setSelected] = useState<Row | null>(() =>
    filterCatalogRows(initialService ? [initialService] : services, "active")[0]
      || filterCatalogRows(services, "active")[0]
      || null
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dependency, setDependency] = useState<Row | null>(null);
  const [batchDependencies, setBatchDependencies] = useState<Record<string, Row>>({});
  const [batchResults, setBatchResults] = useState<Array<{ id: string; name: string; ok: boolean; message: string }>>([]);
  const [reason, setReason] = useState("Catalog maintenance");
  const [replacementId, setReplacementId] = useState("");
  const [catalogView, setCatalogView] = useState<CatalogView>("active");
  const [orderingMode,setOrderingMode]=useState<"alphabetical"|"custom">(Number((initialService||services[0])?.sort_order||0)>0?"custom":"alphabetical");
  const collections: Record<CatalogKind, Row[]> = {
    service_category: sortCatalogRecords(categories),
    service_group: sortCatalogRecords(groups),
    master_style: sortCatalogRecords(services),
    service_addon: sortCatalogRecords(addons),
  };
  const labels: Record<CatalogKind, string> = { service_category: "Categories", service_group: "Service Groups", master_style: "Service Names", service_addon: "Add-ons" };
  const rows = filterCatalogRows(collections[kind], catalogView);
  const visibleIds = new Set(rows.map((row) => String(row.id)));
  const selectedRows = rows.filter((row) => selectedIds.includes(String(row.id)));
  const displayedTargets = selectedRows.length ? selectedRows : selected?.id ? [selected] : [];

  function switchKind(next: CatalogKind) {
    setKind(next);
    const first = filterCatalogRows(collections[next], catalogView)[0] || null;
    setSelected(first);
    setOrderingMode(Number(first?.sort_order || 0) > 0 ? "custom" : "alphabetical");
    setSelectedIds([]);
    setDependency(null);
    setBatchDependencies({});
    setBatchResults([]);
    setReplacementId("");
  }

  function switchCatalogView(next: CatalogView) {
    setCatalogView(next);
    const first = filterCatalogRows(collections[kind], next)[0] || null;
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
    const body = await readApiResponse(
      response,
      "Unable to inspect dependencies.",
    );
    if (!response.ok || body.error) throw new Error(body.error || "Unable to inspect dependencies.");
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
      const body = await readApiResponse(response, "Catalog save failed.");
      if (!response.ok || body.error) throw new Error(body.error || "Catalog save failed");
      const loaded = await reload(false);
      const savedData = body.data as Row | undefined;
      if (!savedData || typeof savedData !== "object" || Array.isArray(savedData)) {
        throw new Error(body.error || "Catalog save failed.");
      }
      const refreshed = ({ service_category: loaded.serviceCategories, service_group: loaded.serviceGroups, master_style: loaded.masterStyles, service_addon: loaded.serviceAddons } as Record<CatalogKind, Row[]>)[kind].find((item) => item.id === savedData.id);
      if (!refreshed) throw new Error("The saved catalog item could not be verified after reloading.");
      setSelected(refreshed);
      if (kind === "master_style") setInitialService(refreshed);
      setNotice(`${labels[kind].replace(/s$/, "")} saved and available to salon owners.`);
    } catch (error) {
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
          const body = await readApiResponse(
            response,
            `${action} failed.`,
          );
          if (!response.ok || body.error) throw new Error(body.error || `${action} failed`);
          results.push({ id: String(target.id), name: String(target.name), ok: true, message: "Completed" });
        } catch (error) {
          const message = error instanceof Error ? error.message : `${action} failed`;
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
      setNotice(error instanceof Error ? error.message : `${action} failed`);
    } finally { setSaving(false); }
  }

  return <div>
    <CatalogSpreadsheetPanel
      authHeaders={authHeaders}
      reload={reload}
      setNotice={setNotice}
      saving={saving}
      setSaving={setSaving}
    />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap rounded-lg border border-plum/10 bg-white p-1">{(Object.keys(labels) as CatalogKind[]).map((value) => <button key={value} type="button" onClick={() => switchKind(value)} className={`rounded-md px-4 py-2 text-xs font-bold ${kind === value ? "bg-plum text-white" : "text-plum"}`}>{labels[value]}</button>)}</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-bold text-plum">Show
          <select value={catalogView} onChange={(event)=>switchCatalogView(event.target.value as CatalogView)} className="ml-2 min-h-10 rounded-lg border border-plum/10 bg-white px-3 text-xs font-normal">
            <option value="active">Active catalog</option>
            <option value="archived">Hidden & archived</option>
            <option value="all">All records</option>
          </select>
        </label>
        <button type="button" onClick={createItem} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white"><Plus size={15}/>Add {labels[kind].replace(/s$/, "")}</button>
      </div>
    </div>
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[280px_1fr]">
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between rounded-lg border border-plum/10 bg-white px-3 py-2 text-[10px]"><b className="text-plum">{selectedRows.length} selected</b><button type="button" disabled={!selectedRows.length} onClick={()=>{setSelectedIds([]);setBatchDependencies({});setBatchResults([]);}} className="font-bold text-magenta gc-disabled-control">Clear selection</button></div>
      <aside className="max-h-[700px] overflow-y-auto rounded-xl border border-plum/10 bg-white p-3"><label className="mb-2 flex items-center gap-2 border-b border-plum/10 px-2 pb-3 text-[10px] font-bold text-plum"><input type="checkbox" checked={Boolean(rows.length) && selectedRows.length === rows.length} onChange={(event)=>{setSelectedIds(event.target.checked ? rows.map((row)=>String(row.id)) : []);setBatchResults([]);}} className="accent-magenta" />Select all current visible results</label>{rows.map((item) => <div key={item.id} className={`mb-1 grid grid-cols-[24px_1fr] items-start rounded-lg ${selected?.id === item.id ? "bg-blush" : ""}`}><input aria-label={`Select ${item.name}`} type="checkbox" checked={selectedIds.includes(String(item.id))} onChange={(event)=>{setSelectedIds((current)=>event.target.checked?[...new Set([...current,String(item.id)])]:current.filter((id)=>id!==String(item.id)));setBatchResults([]);}} className="ml-2 mt-4 accent-magenta"/><button type="button" onClick={() => { setDependency(null); setSelected(item);setOrderingMode(Number(item.sort_order||0)>0?"custom":"alphabetical"); if (kind === "master_style") setInitialService(item); }} className="w-full p-3 text-left"><b className="block text-xs text-plum">{item.name}</b><small>{item.service_category?.name || (kind === "service_category" ? item.slug : "")} {item.archived_at ? "· Archived" : item.is_active ? "· Active" : "· Hidden"}</small></button></div>)}{!rows.length ? <p className="p-4 text-center text-xs text-ink/50">No items yet.</p> : null}</aside>
      </div>
      {selected ? <form key={`${kind}-${selected.id || "new"}`} onSubmit={save} className="min-w-0 self-start rounded-xl border border-plum/10 bg-white p-5">
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
        {batchResults.length && !selectedRows.length ? <section className="mt-5 rounded-xl border border-plum/10 bg-white p-4"><h3 className="font-serif text-lg text-plum">Last batch results</h3><ul className="mt-2 space-y-1 text-xs">{batchResults.map((result)=><li key={`${result.id}-${result.ok}`} className={result.ok ? "gc-text-success" : "gc-text-danger"}>{result.ok ? "Completed" : "Not changed"}: {result.name} · {result.message}</li>)}</ul></section> : null}
        {selectedRows.length ? <section className="mt-5 rounded-xl border border-magenta/20 bg-blush/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-serif text-lg text-plum">Batch dependency preview</h3><b className="rounded-full bg-plum px-3 py-1 text-[10px] text-white">{selectedRows.length} selected</b></div>
          <div className="mt-3 space-y-2">{selectedRows.map((target) => { const preview = batchDependencies[String(target.id)]; const total = Number(preview?.dependencies?.total || 0); return <div key={target.id} className="rounded-lg border border-plum/10 bg-white p-3 text-xs"><div className="flex items-center justify-between gap-3"><b className="text-plum">{target.name}</b><span>{preview?.error ? "Preview failed" : preview ? `${total} dependent record${total === 1 ? "" : "s"}` : "Checking…"}</span></div>{preview?.dependencies?.details?.length ? <ul className="mt-2 space-y-1 text-[10px] text-ink/60">{preview.dependencies.details.map((item:Row)=><li key={item.label}>{item.label}: <b>{item.count}</b> · {item.retention}</li>)}</ul> : null}{preview?.error ? <p className="mt-2 text-[10px] gc-text-danger">{preview.error}</p> : null}</div>; })}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Reason for every selected record" name="batch_reason" value={reason} onChange={setReason}/>{kind === "master_style" || kind === "service_group" ? <label className="text-xs font-bold">Reassign all to<select value={replacementId} onChange={(event)=>setReplacementId(event.target.value)} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">Choose replacement</option>{rows.filter((row)=>!selectedIds.includes(String(row.id))&&row.is_active&&!row.archived_at).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:null}</div>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={()=>void managedAction("archive")} className="rounded-lg border border-plum/20 px-4 py-2 text-xs font-bold text-plum gc-disabled-control">Archive ({selectedRows.length})</button><button type="button" disabled={saving} onClick={()=>void managedAction("restore")} className="rounded-lg border border-green-300 px-4 py-2 text-xs font-bold gc-text-success gc-disabled-control">Restore ({selectedRows.length})</button>{kind === "master_style" || kind === "service_group" ? <button type="button" disabled={saving||!replacementId} onClick={()=>void managedAction("reassign")} className="rounded-lg border border-amber-300 px-4 py-2 text-xs font-bold gc-text-warning gc-disabled-control">Reassign ({selectedRows.length})</button>:null}<button type="button" disabled={saving} onClick={()=>void managedAction("delete")} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-xs font-bold gc-text-danger gc-disabled-control"><Trash2 size={14}/>Safe Delete ({selectedRows.length})</button></div>
          {batchResults.length ? <div className="mt-4 rounded-lg border border-plum/10 bg-white p-3"><b className="text-xs text-plum">Last batch results</b><ul className="mt-2 space-y-1 text-[10px]">{batchResults.map((result)=><li key={`${result.id}-${result.ok}`} className={result.ok ? "gc-text-success" : "gc-text-danger"}>{result.ok ? "Completed" : "Not changed"}: {result.name} · {result.message}</li>)}</ul></div> : null}
        </section> : null}
        {selected.id ? <section className="mt-5 rounded-xl border border-plum/10 bg-cream/45 p-4"><h3 className="font-serif text-lg text-plum">Dependencies & safe actions</h3>{dependency?.dependencies?.details?.length ? <ul className="mt-2 space-y-1 text-xs text-ink/65">{dependency.dependencies.details.map((item:Row)=><li key={item.label}>{item.label}: <b>{item.count}</b> · {item.retention}</li>)}</ul> : <p className="mt-2 text-xs text-ink/55">{dependency?.error || "No dependent records were found."}</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Reason" name="managed_reason" value={reason} onChange={setReason}/>{kind === "master_style" || kind === "service_group" ? <label className="text-xs font-bold">Reassign to<select value={replacementId} onChange={(event)=>setReplacementId(event.target.value)} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">Choose replacement</option>{rows.filter((row)=>row.id!==selected.id&&row.is_active&&!row.archived_at).map((row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>:null}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving||Boolean(selected.archived_at)} onClick={()=>void managedAction("archive")} className="rounded-lg border border-plum/20 px-4 py-2 text-xs font-bold text-plum gc-disabled-control">Archive{selectedIds.length?` (${selectedIds.length})`:""}</button><button type="button" disabled={saving||!selected.archived_at} onClick={()=>void managedAction("restore")} className="rounded-lg border border-green-300 px-4 py-2 text-xs font-bold gc-text-success gc-disabled-control">Restore</button>{kind === "master_style" || kind === "service_group" ? <button type="button" disabled={saving||!replacementId} onClick={()=>void managedAction("reassign")} className="rounded-lg border border-amber-300 px-4 py-2 text-xs font-bold gc-text-warning gc-disabled-control">Reassign</button>:null}<button type="button" disabled={saving} onClick={()=>void managedAction("delete")} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-xs font-bold gc-text-danger"><Trash2 size={14}/>Safe Delete{selectedIds.length?` (${selectedIds.length})`:""}</button></div></section>:null}
        <div className="mt-6 flex flex-wrap gap-3"><button disabled={saving} className="rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white gc-disabled-control">{saving ? "Saving…" : "Save Catalog Item"}</button></div>
      </form> : <div className="rounded-xl border border-dashed border-plum/15 bg-white p-8 text-center text-sm text-ink/50">Add the first catalog item.</div>}
    </div>
  </div>;
}

function LegalPageEditor({ page, setPage, save }: { page: Row; setPage: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void }) {
  const section = asRows(page.sections)[0] || { type: "text", title: "", body: "", is_visible: true };
  return <form onSubmit={save} className="min-w-0 self-start rounded-xl border border-plum/10 bg-white p-5">
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
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  function moveSection(index: number, direction: -1 | 1) {
    setPage((row) => { const sections = [...asRows(row?.sections)]; const nextIndex=index+direction;if(nextIndex<0||nextIndex>=sections.length)return row;[sections[index],sections[nextIndex]]=[sections[nextIndex],sections[index]];return{...row,sections}; });
  }
  return <form onSubmit={save} className="min-w-0 self-start rounded-xl border border-plum/10 bg-white p-5">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-2xl text-plum">Page composition</h2><p className="mt-1 text-xs text-ink/55">Edit constrained Girlz Culture sections and preview the current draft before publishing.</p></div><div className="flex rounded-lg border p-1"><button type="button" onClick={()=>setPreviewMode("desktop")} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-[10px] font-bold ${previewMode==="desktop"?"bg-plum text-white":"text-plum"}`}><Monitor size={13}/>Desktop</button><button type="button" onClick={()=>setPreviewMode("tablet")} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-[10px] font-bold ${previewMode==="tablet"?"bg-plum text-white":"text-plum"}`}><Tablet size={13}/>Tablet</button><button type="button" onClick={()=>setPreviewMode("mobile")} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-[10px] font-bold ${previewMode==="mobile"?"bg-plum text-white":"text-plum"}`}><Smartphone size={13}/>Mobile</button></div></div>
    <ContentPagePreview page={page} mode={previewMode}/>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Field required label="Page title" name="title" value={page.title} />
      <Field label="Eyebrow" name="eyebrow" value={page.eyebrow} />
      <div className="lg:col-span-2"><Field required label="Hero heading" name="hero_title" value={page.hero_title} /></div>
      <Area label="Hero description" name="hero_subtitle" value={page.hero_subtitle} rows={3} />
      <ImageUpload bucket="content-media" preset="content" value={page.hero_image_url} onChange={value => setPage(row => ({ ...row, hero_image_url: value }))} label="Hero image" folder={page.slug} />
      <ImageUpload bucket="content-media" preset="content" value={page.background_image_url} onChange={value => setPage(row => ({ ...row, background_image_url: value }))} label="Background image" folder={page.slug} />
    </div>
    <HeroImageFraming imageUrl={page.hero_image_url} positionX={Number(page.hero_position_x ?? 50)} positionY={Number(page.hero_position_y ?? 50)} zoom={Number(page.hero_zoom ?? 1)} onChange={({ positionX, positionY, zoom }) => setPage(row => ({ ...row, hero_position_x: positionX, hero_position_y: positionY, hero_zoom: zoom }))} />
    {slots.length ? <>
      <h2 className="mt-6 font-serif text-2xl text-plum">Optional page labels</h2>
      <p className="mt-1 text-xs text-ink/55">These labels remain hidden until you add text. Clear a field to remove it from the public page.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{slots.map(([key, label]) => key === "home_intro_visible" ? <label key={key} className="block text-xs font-bold">{label}<select name={`label_${key}`} defaultValue={page.labels?.[key] === "false" ? "false" : "true"} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="true">Show on desktop</option><option value="false">Hide on desktop</option></select></label> : <Field key={key} label={label} name={`label_${key}`} value={page.labels?.[key]} />)}</div>
    </> : null}
    <h2 className="mt-6 font-serif text-2xl text-plum">Sections</h2>
    <div className="mt-3 space-y-3">{asRows(page.sections).map((section: Row, index: number, sections:Row[]) => <SectionEditor key={`${section.id || index}-${asRows(section.cards).length}`} section={section} index={index} sectionCount={sections.length} linkTargets={linkTargets} move={(direction)=>moveSection(index,direction)} update={(next) => setPage(row => ({ ...row, sections: asRows(row?.sections).map((item: Row, itemIndex: number) => itemIndex === index ? next : item) }))} remove={() => setPage(row => ({ ...row, sections: asRows(row?.sections).filter((_: Row, itemIndex: number) => itemIndex !== index) }))} />)}</div>
    <button type="button" onClick={() => setPage(row => ({ ...row, sections: [...asRows(row?.sections), { id: crypto.randomUUID(), type: "card_grid", title: "New Section", body: "", is_visible: true, columns: 4, cards: [] }] }))} className="mt-3 text-xs font-bold text-magenta">+ Add section</button>
    <div className="mt-6 grid gap-3 sm:grid-cols-2"><Field label="SEO title" name="seo_title" value={page.seo_title} /><Field label="SEO description" name="seo_description" value={page.seo_description} /><label className="text-xs font-bold">Status<select name="status" defaultValue={page.status || "Draft"} className="mt-1 w-full rounded-lg border p-3 font-normal"><option>Draft</option><option>Published</option></select></label></div>
    <button className="mt-6 rounded-lg bg-magenta px-7 py-3 text-xs font-bold text-white">Save Page</button>
  </form>;
}

function PromotionRailPreview({ cards, displayLimit, addPromotionCard, linkTargets }: { cards: Row[]; displayLimit: number; addPromotionCard: () => void; linkTargets: Row[] }) {
  const [previewTime] = useState(() => Date.now());
  const availableSalonIds = new Set(linkTargets.filter((target) => target.type === "Salon").map((target) => String(target.id || "").toLowerCase()));
  const availableCampaignIds = new Set(linkTargets.filter((target) => target.type === "Campaign").map((target) => String(target.id || "").toLowerCase()));
  const availableDestinations = new Set(linkTargets.filter((target) => Boolean(target.href)).map((target) => String(target.href)));
  const preview = homepagePromotionPreview(cards, previewTime, displayLimit, { availableSalonIds, availableCampaignIds, availableDestinations });
  return <section className="mt-4 rounded-lg border border-magenta/20 bg-white p-3" aria-label="Effective homepage promotion rail">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-ink/60"><b className="text-plum">Saved source pool: {preview.saved.length}</b><br/>{preview.eligible.length} currently eligible · {preview.fallbackCount} unused position{preview.fallbackCount === 1 ? "" : "s"} filled by editorial fallback.</p>
      <button type="button" onClick={addPromotionCard} disabled={cards.length >= 200} className="min-h-10 rounded-lg bg-magenta px-4 text-xs font-bold text-white gc-disabled-control">+ Add saved promotion</button>
    </div>
    <p className="mt-3 text-[10px] leading-4 text-ink/55">Fallback cards are generated only for the public rail. They are never written into Content Management and never hide or replace an eligible saved card.</p>
    <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {preview.effective.map((card, position) => {
        const saved = preview.eligible.some((candidate) => candidate.id === card.id);
        return <li key={`${card.id}-${position}`} className="rounded-lg border border-plum/10 bg-cream/60 p-2 text-[10px]"><span className={`rounded-full px-2 py-0.5 font-bold ${saved ? "bg-green-100 gc-text-success" : "bg-amber/20 text-plum"}`}>{position + 1} · {saved ? "Saved" : "Fallback"}</span><b className="mt-2 line-clamp-2 block text-plum">{card.title || "Untitled card"}</b></li>;
      })}
    </ol>
    {preview.diagnostics.length ? <div className="mt-4 border-t border-plum/10 pt-3"><b className="text-xs text-plum">Saved-card eligibility</b><ul className="mt-2 space-y-2">{preview.diagnostics.map(({ card, diagnostic }, index) => <li key={card.id || index} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-cream/70 p-3 text-[10px]"><span><b className="block text-plum">{card.title || `Card ${index + 1}`}</b><span className="mt-1 block text-ink/55">{diagnostic.detail}</span></span><span className={`rounded-full px-2 py-1 font-bold ${diagnostic.eligible ? "bg-green-100 gc-text-success" : "bg-red-50 gc-text-danger"}`}>{diagnostic.label}</span></li>)}</ul></div> : null}
  </section>;
}

function editorCardSourceKind(card: Row) {
  if (["upload", "video", "salon", "blog", "custom", "campaign"].includes(String(card.source_kind))) return String(card.source_kind);
  if (card.association_type === "campaign") return "campaign";
  if (card.association_type === "salon" || card.content_type === "salon") return "salon";
  if (card.content_type === "video") return "video";
  if (card.content_type === "link") return "custom";
  return "upload";
}

function SectionEditor({ section, index, sectionCount, linkTargets, update, remove, move, allowRemove = true }: { section: Row; index: number; sectionCount:number; linkTargets: Row[]; update: (section: Row) => void; remove: () => void;move:(direction:-1|1)=>void; allowRemove?: boolean }) {
  const type = String(section.type || "text");
  const cards = asRows(section.cards);
  const minimum = type === "promo_rail" ? 0 : 1;
  const maximum = type === "community_carousel" ? 20 : type === "promo_rail" ? 200 : 12;
  const [cardCountDraft, setCardCountDraft] = useState(String(cards.length));
  function resizeCards(count: number) {
    const next = [...cards];
    while (next.length < count) next.push({ id: crypto.randomUUID(), content_type: "image", source_kind: "upload", title: "", body: "", media_url: "", href: "" });
    update({ ...section, cards: next.slice(0, count), _allow_card_count_change: true });
  }
  function updateCard(cardIndex: number, value: Row) { update({ ...section, cards: cards.map((card, itemIndex) => itemIndex === cardIndex ? value : card) }); }
  function addPromotionCard() {
    if (cards.length >= 200) return;
    update({ ...section, cards: [...cards, { id: crypto.randomUUID(), content_type: "image", source_kind: "upload", title: "", body: "", media_url: "", href: "", status: "Draft", radius_miles: 25, priority: 50, rotation_weight: 1 }], _allow_card_count_change: true });
  }
  function removePromotionCard(cardIndex: number) {
    update({ ...section, cards: cards.filter((_, itemIndex) => itemIndex !== cardIndex), _allow_card_count_change: true });
  }
  function moveCard(cardIndex: number, direction: -1 | 1) {
    const nextIndex = cardIndex + direction;
    if (nextIndex < 0 || nextIndex >= cards.length) return;
    const next = [...cards]; [next[cardIndex], next[nextIndex]] = [next[nextIndex], next[cardIndex]];
    update({ ...section, cards: next });
  }
  function commitCardCount() {
    const count = Number(cardCountDraft);
    if (!Number.isInteger(count) || count < minimum || count > maximum) {
      setCardCountDraft(String(cards.length || minimum));
      return;
    }
    resizeCards(count);
  }
  return <div className="rounded-lg border border-plum/10 bg-blush/25 p-4">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Layout<select value={type} onChange={(event) => update({ ...section, type: event.target.value, cards: ["card_grid", "carousel", "community_carousel", "promo_rail"].includes(event.target.value) ? cards : [] })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option value="text">Text</option><option value="card_grid">Card grid</option><option value="carousel">Horizontal carousel</option><option value="community_carousel">Auto-scrolling community carousel</option><option value="promo_rail">Homepage promotion rail</option><option value="banner">Banner</option></select></label>
        {["card_grid", "carousel", "community_carousel"].includes(type) ? <label className="text-xs font-bold">Number of cards<NumericInput integer min={minimum} max={maximum} value={cardCountDraft} onValueChange={setCardCountDraft} onBlur={commitCardCount} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();commitCardCount();}}} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal" /></label> : null}
        {type === "promo_rail" ? <label className="text-xs font-bold">Cards shown per customer<NumericInput integer min={1} max={20} value={String(section.display_limit || 8)} onValueChange={(value)=>update({ ...section, display_limit:value===""?8:Number(value) })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal" /><small className="mt-1 block font-normal text-ink/55">Each customer sees this many eligible cards from the larger location-aware promotion pool.</small></label> : null}
      </div>
      <div className="flex gap-1"><button type="button" aria-label={`Move section ${index+1} earlier`} onClick={()=>move(-1)} disabled={index===0} className="rounded-md border bg-white p-2 text-plum gc-disabled-control"><ArrowUp size={14}/></button><button type="button" aria-label={`Move section ${index+1} later`} onClick={()=>move(1)} disabled={index===sectionCount-1} className="rounded-md border bg-white p-2 text-plum gc-disabled-control"><ArrowDown size={14}/></button></div><label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold"><input type="checkbox" checked={section.is_visible !== false} onChange={(event) => update({ ...section, is_visible: event.target.checked })} className="accent-magenta" />Published on page</label>
      {allowRemove ? <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-xs font-bold gc-text-danger"><Trash2 size={14}/>Remove section</button> : null}
    </div>
    <Field label="Section heading" name={`section_title_${index}`} value={section.title} />
    <Area label="Section text" name={`section_body_${index}`} value={section.body} rows={4} />
    {type === "banner" ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Button label" name={`section_cta_label_${index}`} value={section.cta_label} /><Field label="Button destination" name={`section_cta_href_${index}`} value={section.cta_href} /></div> : null}
    {type === "card_grid" ? <label className="mt-3 block text-xs font-bold">Columns<select value={Number(section.columns || 4)} onChange={(event) => update({ ...section, columns: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label> : null}
    {type === "community_carousel" ? <label className="mt-3 block text-xs font-bold">Automatic scroll direction<select value={section.scroll_direction === "reverse" ? "reverse" : "forward"} onChange={(event) => update({ ...section, scroll_direction: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option value="forward">Forward</option><option value="reverse">Reverse</option></select><small className="mt-1 block font-normal text-ink/55">Use opposite directions for the two About carousels.</small></label> : null}
    {type === "promo_rail" ? <PromotionRailPreview cards={cards} displayLimit={Number(section.display_limit || 8)} addPromotionCard={addPromotionCard} linkTargets={linkTargets}/> : null}
    {cards.length ? <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">{cards.map((card, cardIndex) => <article key={card.id || cardIndex} className="self-start rounded-xl border border-plum/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><b className="font-serif text-lg text-plum">Card {cardIndex + 1}</b><div className="flex gap-1"><button type="button" aria-label="Move card up" onClick={() => moveCard(cardIndex, -1)} disabled={cardIndex === 0} className="rounded-md border p-2 text-plum gc-disabled-control"><ArrowUp size={14}/></button><button type="button" aria-label="Move card down" onClick={() => moveCard(cardIndex, 1)} disabled={cardIndex === cards.length - 1} className="rounded-md border p-2 text-plum gc-disabled-control"><ArrowDown size={14}/></button>{type === "promo_rail" ? <button type="button" aria-label={`Remove promotion card ${cardIndex + 1}`} onClick={() => removePromotionCard(cardIndex)} className="rounded-md border border-red-200 p-2 gc-text-danger"><Trash2 size={14}/></button> : null}</div></div>
      <label className="mt-3 block text-xs font-bold">Card source<select value={editorCardSourceKind(card)} onChange={(event) => { const value=event.target.value;updateCard(cardIndex,{...card,source_kind:value,content_type:value==="video"?"video":value==="salon"?"salon":value==="custom"?"link":"image",association_type:value==="campaign"?"campaign":value==="salon"?"salon":"",salon_id:value==="salon"?card.salon_id||"":"",campaign_id:value==="campaign"?card.campaign_id||"":""}); }} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="upload">Upload image or GIF</option><option value="video">Video URL</option><option value="salon">Salon profile</option><option value="blog">Blog post</option><option value="custom">Custom destination</option>{type === "promo_rail" ? <option value="campaign">Featured campaign</option> : null}</select><small className="mt-1 block font-normal text-ink/55">Choose the source first. Only the fields needed for that source are shown below.</small></label>
      {editorCardSourceKind(card) === "salon" ? <label className="mt-3 block text-xs font-bold">Salon to feature<select required value={card.salon_id || ""} onChange={(event) => { const target = linkTargets.find((item) => item.type === "Salon" && item.id === event.target.value); updateCard(cardIndex, { ...card, salon_id: target?.id || "", title: target?.label || "", body: target?.body || "", media_url: target?.media_url || "", href: target?.href || "" }); }} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="">Choose a live salon</option>{linkTargets.filter((target) => target.type === "Salon").map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select><small className="mt-1 block font-normal text-ink/55">The card uses this salon’s name, cover photo, location, and public profile link.</small></label> : editorCardSourceKind(card) === "blog" ? <label className="mt-3 block text-xs font-bold">Blog post to feature<select required value={linkTargets.find((target) => target.type === "Blog" && target.href === card.href)?.href || ""} onChange={(event) => { const target = linkTargets.find((item) => item.type === "Blog" && item.href === event.target.value); updateCard(cardIndex, { ...card, title: target?.label || "", media_url: target?.media_url || "", href: target?.href || "" }); }} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="">Choose a published blog post</option>{linkTargets.filter((target) => target.type === "Blog").map((target) => <option key={target.id || target.href} value={target.href}>{target.label}</option>)}</select></label> : editorCardSourceKind(card) === "video" ? <label className="mt-3 block text-xs font-bold">Video URL<input value={card.media_url || ""} onChange={(event) => updateCard(cardIndex, { ...card, media_url: event.target.value })} placeholder="https://example.com/video.mp4" className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label> : editorCardSourceKind(card) === "campaign" ? null : <ImageUpload bucket="content-media" preset="content" value={card.media_url} onChange={(value) => updateCard(cardIndex, { ...card, media_url: typeof value === "string" ? value : "" })} label="Card image or GIF" folder={`${section.id || "section"}/card-${cardIndex + 1}`} />}
      {card.association_type === "campaign" ? <label className="mt-3 block text-xs font-bold">Campaign to feature<select required value={card.campaign_id || ""} onChange={(event) => { const target=linkTargets.find((item)=>item.type==="Campaign"&&item.id===event.target.value);updateCard(cardIndex,{...card,campaign_id:target?.id||"",salon_id:target?.salon_id||"",title:card.title||target?.label||"",body:card.body||target?.body||"",media_url:card.media_url||target?.media_url||"",href:target?.href||""}); }} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="">Choose an eligible featured campaign</option>{linkTargets.filter((target)=>target.type==="Campaign").map((target)=><option key={target.id} value={target.id}>{target.label}</option>)}</select><small className="mt-1 block font-normal text-ink/55">Paid and authorized complimentary campaigns inside a valid schedule are selectable. Public eligibility is checked again on every request.</small></label> : null}
      <label className="mt-3 block text-xs font-bold">Card title<input value={card.title || ""} onChange={(event) => updateCard(cardIndex, { ...card, title: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
      <label className="mt-3 block text-xs font-bold">Card text<textarea rows={3} value={card.body || ""} onChange={(event) => updateCard(cardIndex, { ...card, body: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
      {type === "promo_rail" ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Card status<select value={card.status || "Active"} onChange={(event) => updateCard(cardIndex, { ...card, status: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option>Draft</option><option>Active</option><option>Archived</option></select></label>
        <label className="text-xs font-bold">Call-to-action label<input value={card.cta_label || ""} onChange={(event) => updateCard(cardIndex, { ...card, cta_label: event.target.value })} placeholder="Explore" className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
        <label className="text-xs font-bold">Start date and time<input type="datetime-local" value={String(card.starts_at || "").slice(0, 16)} onChange={(event) => updateCard(cardIndex, { ...card, starts_at: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
        <label className="text-xs font-bold">End date and time<input type="datetime-local" value={String(card.ends_at || "").slice(0, 16)} onChange={(event) => updateCard(cardIndex, { ...card, ends_at: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
        <label className="text-xs font-bold sm:col-span-2">Alternative text<input value={card.alt_text || ""} onChange={(event) => updateCard(cardIndex, { ...card, alt_text: event.target.value })} placeholder="Describe the image for customers using screen readers" className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
        <label className="text-xs font-bold sm:col-span-2">Audience market<select value={card.market_id || ""} onChange={(event) => { const market=linkTargets.find((item)=>item.type==="Market"&&item.id===event.target.value);updateCard(cardIndex,{...card,market_id:market?.id||"",target_label:market?.label||"",target_latitude:market?.target_latitude??null,target_longitude:market?.target_longitude??null}); }} className="mt-1 w-full rounded-lg border border-plum/10 bg-white p-3 font-normal"><option value="">All locations</option>{linkTargets.filter((target)=>target.type==="Market").map((target)=><option key={target.id} value={target.id}>{target.label}</option>)}</select><small className="mt-1 block font-normal text-ink/55">Choose a market to show this card only to customers inside its radius. Salon and campaign cards inherit their real salon location.</small></label>
        {card.market_id || ["salon", "campaign"].includes(String(card.association_type || "")) ? <label className="text-xs font-bold">Audience radius (miles)<NumericInput integer min={1} max={250} value={String(card.radius_miles || 25)} onValueChange={(value)=>updateCard(cardIndex,{...card,radius_miles:value===""?25:Number(value)})} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /><small className="mt-1 block font-normal text-ink/55">Salon cards use this radius. Campaign cards can be narrowed here but never broadened beyond the campaign’s authorized radius.</small></label> : null}
        <label className="text-xs font-bold">Priority<NumericInput integer min={0} max={100} value={String(card.priority ?? 50)} onValueChange={(value)=>updateCard(cardIndex,{...card,priority:value===""?50:Number(value)})} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /><small className="mt-1 block font-normal text-ink/55">Higher-priority eligible cards appear first inside the customer’s radius.</small></label>
        <label className="text-xs font-bold">Rotation weight<NumericInput min={0.1} max={100} decimalPlaces={1} value={String(card.rotation_weight ?? 1)} onValueChange={(value)=>updateCard(cardIndex,{...card,rotation_weight:value===""?1:Number(value)})} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>
      </div> : null}
      {["upload", "video", "custom"].includes(editorCardSourceKind(card)) ? <><label className="mt-3 block text-xs font-bold">Destination<select value={linkTargets.some((target) => target.href && target.href === card.href) ? card.href : ""} onChange={(event) => updateCard(cardIndex, { ...card, href: event.target.value })} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal"><option value="">No saved destination / custom URL</option>{linkTargets.filter((target)=>Boolean(target.href)).map((target) => <option key={`${target.type}-${target.id || target.href}`} value={target.href}>{target.type}: {target.label}</option>)}</select></label><label className="mt-3 block text-xs font-bold">Custom destination<input value={card.href || ""} onChange={(event) => updateCard(cardIndex, { ...card, href: event.target.value })} placeholder="/salon/example or https://…" className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label></> : <p className="mt-3 rounded-lg bg-blush/40 p-3 text-xs text-plum">The {editorCardSourceKind(card)} destination is linked automatically.</p>}
    </article>)}</div> : null}
  </div>;
}

function ContentPagePreview({page,mode}:{page:Row;mode:"desktop"|"tablet"|"mobile"}){const sections=asRows(page.sections).filter(section=>section.is_visible!==false);const width=mode==="mobile"?"max-w-[360px]":mode==="tablet"?"max-w-[820px]":"max-w-full";return <section className="mb-6 rounded-xl border border-dashed border-magenta/30 bg-cream p-4"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-magenta"><Eye size={13}/>Unpublished draft preview · {mode}</p><div className={`mx-auto mt-3 overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${width}`}><div className="relative min-h-36 bg-[linear-gradient(120deg,#0D1114,#0083A6)] bg-cover bg-center p-6 text-white" style={page.hero_image_url?{backgroundImage:`linear-gradient(120deg,rgba(13,17,20,.88),rgba(0,131,166,.45)),url(${String(page.hero_image_url)})`}:undefined}><span className="text-[9px] font-bold uppercase tracking-[.16em] text-amber">{String(page.eyebrow||page.title||"Girlz Culture")}</span><h3 className="mt-2 font-serif text-3xl leading-none">{String(page.hero_title||page.title||"Untitled page")}</h3><p className="mt-3 max-w-xl text-xs leading-5 gc-text-on-dark-muted">{String(page.hero_subtitle||"")}</p></div><div className="space-y-4 p-4">{sections.map((section,index)=><div key={section.id||index} className="rounded-lg bg-blush/25 p-4"><h4 className="font-serif text-xl text-plum">{String(section.title||`Section ${index+1}`)}</h4>{section.body?<p className="mt-2 text-[10px] leading-5 text-ink/60">{String(section.body).slice(0,260)}</p>:null}{asRows(section.cards).length?<div className={`mt-3 grid gap-2 ${mode==="mobile"?"grid-cols-2":mode==="tablet"?"grid-cols-3":"grid-cols-4"}`}>{asRows(section.cards).slice(0,mode==="mobile"?4:8).map((card,cardIndex)=><div key={card.id||cardIndex} className="min-h-24 overflow-hidden rounded-md border bg-white bg-cover bg-center p-2" style={card.media_url?{backgroundImage:`linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.94)),url(${String(card.media_url)})`}:undefined}><b className="text-[9px] text-plum">{String(card.title||`Card ${cardIndex+1}`)}</b><p className="mt-1 line-clamp-2 text-[8px] text-ink/60">{String(card.body||"")}</p></div>)}</div>:null}</div>)}{!sections.length?<p className="rounded-lg border border-dashed p-6 text-center text-xs text-ink/45">No visible sections in this draft.</p>:null}</div></div></section>}

function PostEditor({ post, setPost, save, remove, saving }: { post: Row; setPost: React.Dispatch<React.SetStateAction<Row | null>>; save: (event: FormEvent<HTMLFormElement>) => void; remove: () => void; saving: boolean }) {
  const publication = resolvedPublicationUi(post);
  return <form onSubmit={save} className="min-w-0 rounded-xl border border-plum/10 bg-white p-5"><div className="grid gap-4 sm:grid-cols-2"><Field required label="Title" name="title" value={post.title} /><Field required label="Slug" name="slug" value={post.slug} /><Field required label="Category" name="category" value={post.category} /><div className="rounded-lg border border-plum/10 p-3 text-xs"><b className="text-plum">{publication.label}</b><p className="mt-1 leading-5 text-ink/50">Use the explicit actions below to control public visibility.</p></div></div><Area label="Excerpt" name="excerpt" value={post.excerpt} rows={3} /><ImageUpload bucket="content-media" preset="content" value={post.cover_image_url} onChange={value => setPost(row => ({ ...row, cover_image_url: value }))} label="Cover image" folder="blog" /><Area label="Article content · use ### for headings" name="content" value={post.content} rows={16} /><label className="mt-3 flex gap-2 text-xs"><input type="checkbox" name="featured" defaultChecked={post.featured} />Feature this post</label><div className="mt-5 flex flex-wrap items-end gap-3"><PublicationActions status={String(post.status || "Draft")} scheduledAt={post.scheduled_publish_at} saving={saving} subject="Blog post" hasPublicVersion={publication.isPublic}/>{post.id ? <button type="button" onClick={remove} className="flex min-h-10 items-center gap-2 rounded-lg border border-red-300 px-5 text-xs gc-text-danger"><Trash2 size={15} />Delete</button> : null}</div></form>;
}

function Field({ label, name, value, required = false, type = "text", onChange }: { label: string; name: string; value?: string | number; required?: boolean; type?: string; onChange?: (value: string) => void }) { return <label className="block text-xs font-bold">{label}<input required={required} type={type} name={name} defaultValue={value ?? ""} onChange={onChange ? (event)=>onChange(event.target.value) : undefined} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal" /></label>; }
function Area({ label, name, value, rows }: { label: string; name: string; value?: string; rows: number }) { return <label className="mt-4 block text-xs font-bold">{label}<textarea name={name} defaultValue={value || ""} rows={rows} className="mt-1 w-full rounded-lg border border-plum/10 p-3 font-normal leading-6" /></label>; }
