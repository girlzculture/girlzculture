import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import SafeImage from "@/components/site/SafeImage";
import { getContentPage } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";

export const dynamic = "force-dynamic";

export default async function Press() {
  const page = await getContentPage("press", { slug: "press", title: "Press", eyebrow: "PRESS", hero_title: "Press", hero_subtitle: "Official Girlz Culture news and media information will be published here.", hero_image_url: "/images/braids-knotless.jpg", sections: [] });
  return <main className="min-h-screen bg-cream text-ink"><PublicHeader/><section className="relative overflow-hidden bg-plum text-white"><div className="mx-auto grid max-w-[1760px] items-center gap-8 px-5 py-10 md:grid-cols-[1fr_.75fr] lg:px-16"><div><p className="text-xs font-bold text-amber">{page.eyebrow}</p><h1 className="mt-4 font-serif text-6xl font-semibold">{page.hero_title}</h1><p className="mt-4 max-w-xl text-sm leading-7 text-white/70">{page.hero_subtitle}</p></div><SafeImage src={page.hero_image_url} fallbackSrc="/images/braids-knotless.jpg" alt="Girlz Culture press" className="h-[320px] w-full rounded-[22px] object-cover" style={{ objectPosition: `${Number(page.hero_position_x ?? 50)}% ${Number(page.hero_position_y ?? 0)}%`, transform: `scale(${Number(page.hero_zoom ?? 1)})` }}/></div></section>{page.sections?.length ? <PublicContentSections sections={page.sections} /> : <section className="mx-auto max-w-[1200px] px-5 py-10"><div className="rounded-[18px] border border-dashed border-plum/20 bg-white/60 p-10 text-center"><h2 className="font-serif text-3xl text-plum">No press updates yet</h2></div></section>}<PublicFooter/></main>;
}
