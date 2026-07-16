"use client";

import { useState } from "react";
import { BarChart3, BadgeDollarSign } from "lucide-react";
import AdminFeaturedCampaigns from "@/components/admin/AdminFeaturedCampaigns";
import AdminTrendingCampaigns from "@/components/admin/AdminTrendingCampaigns";

export default function AdminMarketingWorkspace({ overview }: { overview: React.ReactNode }) {
  const [tab,setTab]=useState<"overview"|"featured"|"trending">("overview");
  return <div><div role="tablist" aria-label="Marketing administration" className="mb-5 grid overflow-hidden rounded-[12px] border border-plum/10 bg-white sm:grid-cols-3"><button role="tab" aria-selected={tab==="overview"} onClick={()=>setTab("overview")} className={`flex min-h-12 items-center justify-center gap-2 text-xs font-bold ${tab==="overview"?"bg-blush text-magenta":"text-ink/65"}`}><BarChart3 size={16}/>Marketing overview</button><button role="tab" aria-selected={tab==="featured"} onClick={()=>setTab("featured")} className={`flex min-h-12 items-center justify-center gap-2 text-xs font-bold ${tab==="featured"?"bg-blush text-magenta":"text-ink/65"}`}><BadgeDollarSign size={16}/>Featured Salons</button><button role="tab" aria-selected={tab==="trending"} onClick={()=>setTab("trending")} className={`flex min-h-12 items-center justify-center gap-2 text-xs font-bold ${tab==="trending"?"bg-blush text-magenta":"text-ink/65"}`}><BadgeDollarSign size={16}/>Trending Picks</button></div>{tab==="featured"?<AdminFeaturedCampaigns/>:tab==="trending"?<AdminTrendingCampaigns/>:overview}</div>;
}
