import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
type Row = Record<string, unknown>;

function safeKnowledgeText(value: unknown, maxLength = 600) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maxLength)
    : "";
}

function knowledgeSegments(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const page = value as Row;
  const slug = safeKnowledgeText(page.slug, 120);
  if (slug && !/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/u.test(slug)) return [];
  const pageTitle = safeKnowledgeText(page.title || page.hero_title || slug, 160);
  const segments: { title: string; question: string; answer: string; href: string }[] = [];
  const add = (question: unknown, answer: unknown) => {
    const cleanQuestion = safeKnowledgeText(question, 180);
    const cleanAnswer = safeKnowledgeText(answer, 700);
    if (cleanAnswer) segments.push({ title: pageTitle, question: cleanQuestion || pageTitle, answer: cleanAnswer, href: slug ? `/${slug}` : "/help" });
  };
  add(page.hero_title || pageTitle, page.hero_subtitle);
  for (const sectionValue of Array.isArray(page.sections) ? page.sections.slice(0, 40) : []) {
    if (!sectionValue || typeof sectionValue !== "object" || Array.isArray(sectionValue)) continue;
    const section = sectionValue as Row;
    if (section.is_visible === false) continue;
    const title = safeKnowledgeText(section.title || pageTitle, 180);
    // Preserve FAQ line boundaries until each question/answer pair is split.
    const body = typeof section.body === "string" ? section.body.slice(0, 6000) : "";
    if (!body) continue;
    const lines = body.split(/\n+/u).map(line => line.trim()).filter(Boolean).slice(0, 80);
    for (const line of lines) {
      const [question, ...answer] = line.split("::");
      if (answer.length) add(question, answer.join("::"));
      else add(title, line);
    }
  }
  return segments;
}

export async function searchPublishedKnowledge(context: {admin: SupabaseClient}, queryValue: unknown, language = "en") {
  const query = safeKnowledgeText(queryValue, 240).toLocaleLowerCase();
  const tokens = [...new Set(query.split(/[^\p{L}\p{N}]+/u).filter(token => token.length > 1))].slice(0, 12);
  if (!query || !tokens.length) throw new Error("KNOWLEDGE_QUERY_INVALID");
  // Read only general platform guidance. Never load the full public page
  // inventory, business profiles or a user-supplied URL into owner context.
  const published = await Promise.all(["help", "faq", "how-it-works", "pricing", "terms", "privacy"].map(slug => context.admin.rpc("get_public_content_page", { p_slug: slug })));
  const failure = published.find(result => result.error);
  if (failure?.error) throw failure.error;
  const pages = published.map(result => result.data).filter(Boolean);
  // Enforce the public guidance boundary again on returned rows, even if a
  // future CMS procedure accidentally returns a different page's snapshot.
  const slugs = new Set(["help", "faq", "how-it-works", "pricing", "terms", "privacy"]);
  const segments = pages.filter(page => slugs.has(page.slug)).flatMap(knowledgeSegments);
  const translated = new Map<string,string>();
  if (["fr","es","zh-CN"].includes(language) && segments.length) {
    const sources = [...new Set(segments.flatMap(segment => [segment.title,segment.question,segment.answer]))];
    // Fetch only published translations of these exact general-guidance
    // excerpts. Never search a tenant's translation history or draft text.
    for(let offset=0;offset<sources.length;offset+=100){
      const result = await context.admin.from("translation_entries").select("source_text,translated_text").eq("locale",language).eq("status","Published").in("source_text",sources.slice(offset,offset+100));
      if(result.error)throw result.error;
      for(const row of result.data||[]){const text=safeKnowledgeText(row.translated_text,700);if(text)translated.set(row.source_text,text);}
    }
  }
  const scored = segments.map(segment => {
    const haystack = `${segment.title} ${segment.question} ${segment.answer}`.toLocaleLowerCase();
    const localized = [segment.title,segment.question,segment.answer].map(text=>translated.get(text)||"").join(" ").toLocaleLowerCase();
    const score = (haystack.includes(query)||localized.includes(query) ? 20 : 0) + tokens.reduce((total, token) => total + (haystack.includes(token)||localized.includes(token) ? 2 : 0), 0);
    return { ...segment, score };
  }).filter(segment => segment.score > 0).sort((left, right) => right.score - left.score || left.question.localeCompare(right.question));
  const seen = new Set<string>();
  const matches = scored.filter(segment => {
    const key = `${segment.href}:${segment.question}:${segment.answer}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 5).map(segment => ({ title: translated.get(segment.title)||segment.title, question: translated.get(segment.question)||segment.question, answer: translated.get(segment.answer)||segment.answer, href: segment.href, language:translated.has(segment.answer)?language:"en" }));
  return { query, matches, total: matches.length, source: "published_girlz_culture_content" };
}
