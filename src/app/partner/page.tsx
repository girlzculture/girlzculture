import Link from "next/link";
import { CalendarDays, CreditCard, Heart, Search, ShieldCheck, UsersRound } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { getContentPage } from "@/lib/content";
import PublicContentSections from "@/components/site/PublicContentSections";
import SafeImage from "@/components/site/SafeImage";

const benefits = [
  [UsersRound, "Reach More Clients", "Help nearby clients discover your salon."], [CalendarDays, "Fill Your Calendar", "Smart booking tools help you stay booked and in control."],
  [Search, "Get Discovered", "Show up in local search and relevant service results."], [CreditCard, "Transparent Bookings", "Real-time availability and clear booking details."],
  [ShieldCheck, "Secure Deposits", "Protect your time with upfront deposits."], [Heart, "Build Your Brand", "Create your profile, showcase your work, and grow your name."],
] as const;

export default async function PartnerPage() {
  const content = await getContentPage("partner", { slug: "partner", title: "Partner with us", labels: {} });
  const photoLabels = [content.labels?.stat_label_1, content.labels?.stat_label_2, content.labels?.stat_label_3].filter(Boolean) as string[];
  return <main className="min-h-screen overflow-x-hidden bg-cream text-ink"><PublicHeader/>
    <section className="mx-auto grid w-full max-w-[1760px] items-center gap-5 overflow-hidden px-4 pb-6 pt-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,.9fr)] md:gap-8 md:py-10 lg:px-16"><div className="min-w-0"><h1 className="max-w-3xl font-serif text-[clamp(2.35rem,9vw,4.25rem)] font-semibold leading-[.96] text-plum">{content.hero_title || "Grow Your Business with Girlz Culture"}</h1>{content.hero_subtitle ? <p className="mt-4 max-w-xl text-sm leading-6 text-ink/70 sm:text-lg sm:leading-8">{content.hero_subtitle}</p> : null}<div className="mt-5 flex flex-wrap gap-3"><Link href="/salon/signup" className="rounded-[9px] bg-magenta px-6 py-3 text-center text-sm font-bold text-white">Join Now</Link><a href="#how" className="px-4 py-3 text-center text-sm font-bold text-magenta">See How It Works</a></div></div><div className="relative min-h-[245px] min-w-0 overflow-hidden rounded-[20px] bg-blush sm:min-h-[420px]"><SafeImage src={content.hero_image_url} fallbackSrc="/images/hero-braids.jpg" alt="Girlz Culture salon partner" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${Number(content.hero_position_x ?? 50)}% ${Number(content.hero_position_y ?? 30)}%`, transform: `scale(${Number(content.hero_zoom ?? 1)})` }}/>{photoLabels.length ? <div className="absolute inset-x-3 bottom-3 grid gap-2 rounded-[14px] bg-white/90 p-3 backdrop-blur sm:inset-x-6 sm:grid-cols-3">{photoLabels.map(label => <p key={label} className="text-center text-[10px] font-semibold leading-4 text-plum">{label}</p>)}</div> : null}</div></section>
    <section className="mx-auto max-w-[1660px] px-4 py-7 sm:px-6 lg:px-14"><h2 className="text-center font-serif text-2xl font-semibold text-plum sm:text-3xl">Why Salons Partner With Us</h2><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{benefits.map(([Icon,title,body])=><article key={title} className="min-w-0 rounded-[14px] bg-blush/35 p-3 text-center sm:p-5"><span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-plum"><Icon size={20}/></span><h3 className="mt-3 break-words text-sm font-semibold text-plum">{title}</h3><p className="mt-2 hidden text-xs leading-5 text-ink/65 sm:block">{body}</p></article>)}</div></section>
    <section id="how" className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6"><h2 className="text-center font-serif text-3xl font-semibold text-plum">How It Works</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{["Apply","Get Approved","Activate Plan","Get Discovered"].map((step,index)=><article key={step} className="min-w-0 rounded-[14px] border border-plum/10 bg-white p-4"><span className="grid h-7 w-7 place-items-center rounded-full bg-magenta text-xs font-bold text-white">{index+1}</span><h3 className="mt-4 break-words text-sm font-semibold">{step}</h3></article>)}</div><div className="mt-6 text-center"><Link href="/salon/signup" className="inline-flex rounded-[9px] bg-magenta px-8 py-3.5 font-bold text-white">Join Now</Link></div></section>
    <PublicContentSections sections={content.sections} />
    <PublicFooter/>
  </main>;
}
