import Link from "next/link";
import { Bookmark, CalendarDays, FileText } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import SafeImage from "@/components/site/SafeImage";
import { getBlogPosts, type BlogPost } from "@/lib/content";

const categories = ["All Articles", "Hair Care", "Braided Styles", "Beauty & Wellness", "Salon Business", "Community Stories"];

// Content saves explicitly revalidate this route. A short cache window keeps a
// transient database/network stall from turning a public blog request into a
// hosting-layer 502 during cold starts.
export const revalidate = 300;

export default async function Blog({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category = "All Articles" } = await searchParams;
  const records = await getBlogPosts();
  const posts = category === "All Articles" ? records : records.filter((post) => post.category === category);
  const featured = posts.find((post) => post.featured) || posts[0];

  return <main className="min-h-screen bg-cream text-ink">
    <PublicHeader active="blog"/>
    <section className="mx-auto grid max-w-[1600px] gap-7 px-5 py-8 lg:grid-cols-[.55fr_1.45fr]">
      <div><h1 className="font-serif text-7xl font-semibold text-plum">Blog</h1><p className="mt-5 font-semibold">Beauty. Culture. Confidence.</p><p className="mt-3 max-w-md text-sm leading-6 text-ink/65">Expert tips, style inspiration, and real stories from the braid community.</p></div>
      {featured ? <article className="grid overflow-hidden rounded-[18px] bg-blush/40 md:grid-cols-2"><SafeImage src={featured.cover_image_url} fallbackSrc="/images/hero-braids.jpg" alt={featured.title} className="h-72 w-full object-cover"/><div className="p-6"><span className="inline-flex items-center gap-1.5 rounded-full bg-amber/20 px-3 py-1 text-xs font-bold text-amber-700"><Bookmark size={13} aria-hidden="true"/>Featured</span><p className="mt-5 text-xs font-bold uppercase text-magenta">{featured.category}</p><h2 className="mt-2 font-serif text-4xl text-plum">{featured.title}</h2><p className="mt-3 text-sm leading-6 text-ink/65">{featured.excerpt}</p><Link href={`/blog/${featured.slug}`} className="mt-6 inline-flex rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white">Read More</Link></div></article> : <div className="grid min-h-64 place-items-center rounded-[18px] border border-dashed border-plum/20 bg-white/60 p-8 text-center"><div><FileText className="mx-auto text-magenta"/><h2 className="mt-4 font-serif text-2xl text-plum">No articles published yet</h2><p className="mt-2 text-sm text-ink/60">New editorial stories will appear here after an admin publishes them.</p></div></div>}
    </section>
    <section className="mx-auto max-w-[1600px] px-5 pb-10">
      <nav aria-label="Blog categories" className="flex gap-2 overflow-x-auto rounded-[14px] border border-plum/10 bg-white p-3">{categories.map((item) => <Link key={item} href={item === "All Articles" ? "/blog" : `/blog?category=${encodeURIComponent(item)}`} className={`shrink-0 rounded-lg px-5 py-2 text-xs font-semibold ${category === item ? "bg-magenta text-white" : ""}`}>{item}</Link>)}</nav>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{posts.filter((post) => post.slug !== featured?.slug).map((post) => <PostCard key={post.slug} post={post}/>)}</div>
      {records.length > 0 && !posts.length ? <div className="mt-5 rounded-[14px] border border-dashed border-plum/20 bg-white/60 p-8 text-center text-sm text-ink/60">No published articles in this category.</div> : null}
    </section>
    <PublicFooter/>
  </main>;
}

function PostCard({ post }: { post: BlogPost }) {
  return <Link href={`/blog/${post.slug}`} className="overflow-hidden rounded-[16px] border border-plum/10 bg-blush/25"><SafeImage src={post.cover_image_url} fallbackSrc="/images/braids-box.jpg" alt={post.title} className="h-52 w-full object-cover"/><div className="p-5"><p className="text-[10px] font-bold uppercase text-magenta">{post.category}</p><h2 className="mt-2 font-serif text-2xl leading-tight text-plum">{post.title}</h2><p className="mt-3 text-sm leading-6 text-ink/60">{post.excerpt}</p><p className="mt-4 flex items-center gap-2 text-xs text-ink/50"><CalendarDays size={14}/>{post.published_at ? new Date(post.published_at).toLocaleDateString() : "Publication date not set"} · {readMinutes(post.content)} min read</p></div></Link>;
}

function readMinutes(content: string) {
  return Math.max(1, Math.ceil(content.trim().split(/\s+/).filter(Boolean).length / 220));
}
