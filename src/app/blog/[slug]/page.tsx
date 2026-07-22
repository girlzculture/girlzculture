import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import SafeImage from "@/components/site/SafeImage";
import { getBlogPost } from "@/lib/content";

export const revalidate = 300;

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();
  const blocks = post.content.split(/\n\n+/).filter(Boolean);
  const headings = blocks.filter((block) => block.startsWith("### ")).map((block) => block.slice(4));
  const minutes = Math.max(1, Math.ceil(post.content.trim().split(/\s+/).filter(Boolean).length / 220));

  return <main className="bg-cream text-ink">
    <PublicHeader active="blog"/>
    <article>
      <header className="mx-auto grid max-w-[1600px] items-center gap-7 px-5 py-8 lg:grid-cols-[1fr_.85fr]">
        <div><p className="text-xs font-bold uppercase text-magenta">{post.category}</p><h1 className="mt-3 font-serif text-5xl font-semibold leading-none text-plum sm:text-6xl">{post.title}</h1><p className="mt-4 text-lg text-ink/65">{post.excerpt}</p><p className="mt-5 flex items-center gap-2 text-xs text-ink/50"><CalendarDays size={15}/>{post.published_at ? new Date(post.published_at).toLocaleDateString() : "Publication date not set"} · {minutes} min read</p></div>
        <SafeImage src={post.cover_image_url} fallbackSrc="/images/hero-braids.jpg" alt={post.title} className="h-[380px] w-full rounded-[22px] object-cover"/>
      </header>
      <div className="mx-auto grid max-w-[1250px] gap-8 px-5 pb-12 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5 text-[15px] leading-8 text-ink/75">{blocks.map((block, index) => block.startsWith("### ") ? <h2 id={headingId(block.slice(4))} key={index} className="scroll-mt-24 font-serif text-3xl text-plum">{block.slice(4)}</h2> : <p key={index}>{block}</p>)}</div>
        <aside className="space-y-4">{headings.length ? <div className="rounded-[14px] bg-blush/35 p-5"><h2 className="font-serif text-xl text-plum">In this article</h2><nav className="mt-3 flex flex-col gap-2 text-xs leading-5">{headings.map((heading) => <a key={heading} href={`#${headingId(heading)}`} className="hover:text-magenta">{heading}</a>)}</nav></div> : null}<div className="rounded-[14px] bg-plum p-5 text-white"><h2 className="font-serif text-2xl">Ready for your next look?</h2><Link href="/salons" className="mt-4 block rounded-lg bg-magenta py-3 text-center text-xs font-bold">Find Your Salon</Link></div></aside>
      </div>
    </article>
    <PublicFooter/>
  </main>;
}

function headingId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
