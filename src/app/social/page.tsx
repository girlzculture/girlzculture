import Link from "next/link";
import { Camera, Music2, UsersRound, Video } from "lucide-react";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";

const configuredChannels = [
  ["Instagram", process.env.NEXT_PUBLIC_INSTAGRAM_URL, Camera],
  ["TikTok", process.env.NEXT_PUBLIC_TIKTOK_URL, Music2],
  ["YouTube", process.env.NEXT_PUBLIC_YOUTUBE_URL, Video],
  ["Facebook", process.env.NEXT_PUBLIC_FACEBOOK_URL, UsersRound],
] as const;

export default function SocialPage() {
  const channels = configuredChannels.filter((channel) => Boolean(channel[1]));
  return <main className="min-h-screen bg-cream pb-20 text-ink md:pb-0"><PublicHeader/><section className="mx-auto min-h-[65vh] w-full max-w-[1100px] px-4 py-8 sm:px-8 sm:py-14"><p className="text-xs font-bold uppercase tracking-[.17em] text-magenta">Girlz Culture community</p><h1 className="mt-3 font-serif text-4xl font-semibold leading-none text-plum sm:text-6xl">Follow the culture<span className="text-magenta">.</span></h1><p className="mt-4 max-w-2xl text-sm leading-6 text-ink/65 sm:text-base">Find official Girlz Culture social channels, fresh salon work, platform news, and beauty inspiration.</p>{channels.length ? <div className="mt-8 grid gap-3 sm:grid-cols-2">{channels.map(([label,url,Icon]) => <Link key={label} href={url!} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-[16px] border border-plum/10 bg-white p-5 shadow-sm"><span className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-full bg-blush text-magenta"><Icon/></span><b className="font-serif text-xl text-plum">{label}</b></span><span className="text-sm font-bold text-magenta">Open →</span></Link>)}</div> : <div className="mt-8 rounded-[16px] border border-dashed border-plum/20 bg-white/60 p-7"><h2 className="font-serif text-2xl text-plum">Official channels are being connected</h2><p className="mt-2 text-sm text-ink/60">Links will appear here only after Girlz Culture configures its verified profiles.</p></div>}</section><PublicFooter/><CustomerBottomNav active="social"/></main>;
}
