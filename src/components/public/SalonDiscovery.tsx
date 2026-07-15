"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Heart, List, Map, MapPin, ShieldCheck, Star, Tag } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import { LocationAutocomplete, StyleAutocomplete } from "@/components/search/AutocompleteInputs";
import GoogleSalonMap from "@/components/search/GoogleSalonMap";

export type DiscoverySalon = {
  id: string; name: string; slug: string; city: string; state: string; zip: string;
  rating: number; reviewCount: number; image: string; startingPrice: number | null;
  tier: string; verified: boolean; services: Array<{ id: string; name: string }>;
  nextAvailability: string | null; statusLabel: string;
  latitude?: number | null; longitude?: number | null; closedToday?: boolean;
};

const tierRank: Record<string, number> = { premium: 3, platinum: 3, growth: 2, pro: 2, essentials: 2, basic: 1, free: 0, "free-seed": 0 };

function milesBetween(origin: { lat: number; lng: number }, salon: DiscoverySalon) {
  if (!Number.isFinite(Number(salon.latitude)) || !Number.isFinite(Number(salon.longitude))) return Infinity;
  const radians = (value: number) => value * Math.PI / 180;
  const earthMiles = 3958.8;
  const dLat = radians(Number(salon.latitude) - origin.lat);
  const dLng = radians(Number(salon.longitude) - origin.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(origin.lat)) * Math.cos(radians(Number(salon.latitude))) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

export default function SalonDiscovery({ initialSalons, initialStyle = "", initialLocation = "" }: { initialSalons: DiscoverySalon[]; initialStyle?: string; initialLocation?: string }) {
  const [style,setStyle]=useState(initialStyle); const [location,setLocation]=useState(initialLocation);
  const [submittedStyle,setSubmittedStyle]=useState(initialStyle); const [submittedLocation,setSubmittedLocation]=useState(initialLocation);
  const [origin,setOrigin]=useState<{lat:number;lng:number}|null>(null); const [view,setView]=useState<"list"|"map">("list");
  const [price,setPrice]=useState("Any price"); const [rating,setRating]=useState("Any rating"); const [distance,setDistance]=useState("Any distance");
  const [availabilityDate,setAvailabilityDate]=useState(""); const [availability,setAvailability]=useState<Record<string,boolean>>({}); const [availabilityLoading,setAvailabilityLoading]=useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!availabilityDate) { setAvailability({}); setAvailabilityLoading(false); return; }
      setAvailabilityLoading(true);
      const checks = await Promise.all(initialSalons.slice(0, 60).map(async (salon) => {
        const styleTerm = submittedStyle.toLowerCase();
        const service = salon.services.find((item) => item.name.toLowerCase().includes(styleTerm)) || salon.services[0];
        if (!service) return [salon.id, false] as const;
        try {
          const response = await fetch(`/api/booking-availability?salon_id=${encodeURIComponent(salon.id)}&style_id=${encodeURIComponent(service.id)}&date=${availabilityDate}`);
          const body = await response.json();
          return [salon.id, response.ok && Array.isArray(body.slots) && body.slots.length > 0] as const;
        } catch { return [salon.id, false] as const; }
      }));
      setAvailability(Object.fromEntries(checks)); setAvailabilityLoading(false);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [availabilityDate, initialSalons, submittedStyle]);

  const salons = useMemo(() => initialSalons.filter((salon) => {
    const styleTerm=submittedStyle.trim().toLowerCase(); const locationTerm=submittedLocation.trim().toLowerCase();
    if(styleTerm&&!`${salon.name} ${salon.services.map(item=>item.name).join(" ")}`.toLowerCase().includes(styleTerm))return false;
    if(locationTerm&&!origin){const primary=locationTerm.split(",")[0].trim();if(!`${salon.city} ${salon.state} ${salon.zip}`.toLowerCase().includes(primary))return false;}
    const amount=salon.startingPrice;
    if(price!=="Any price"&&amount==null)return false;
    if(price==="Under $100"&&(amount??Infinity)>=100)return false;
    if(price==="Under $150"&&(amount??Infinity)>=150)return false;
    if(price==="$150–$250"&&((amount??0)<150||(amount??Infinity)>250))return false;
    if(price==="$250+"&&(amount??0)<250)return false;
    if(rating==="4.8+"&&salon.rating<4.8)return false; if(rating==="4.5+"&&salon.rating<4.5)return false; if(rating==="4.3+"&&salon.rating<4.3)return false; if(rating==="4.0+"&&salon.rating<4)return false; if(rating==="Below 4.0"&&salon.rating>=4)return false;
    if(distance!=="Any distance"){if(!origin)return false;const miles=milesBetween(origin,salon);if(distance==="< 1 mi"&&miles>=1)return false;if(distance==="1–2 mi"&&(miles<1||miles>2))return false;if(distance==="2–3 mi"&&(miles<2||miles>3))return false;}
    if(availabilityDate&&!availability[salon.id])return false;
    return true;
  }).sort((a,b)=>(tierRank[b.tier.toLowerCase()]||0)-(tierRank[a.tier.toLowerCase()]||0)||b.rating-a.rating||(origin?milesBetween(origin,a)-milesBetween(origin,b):0)),[availability,availabilityDate,distance,initialSalons,origin,price,rating,submittedLocation,submittedStyle]);

  function submit(event:FormEvent){event.preventDefault();setSubmittedStyle(style);setSubmittedLocation(location);const params=new URLSearchParams();if(style)params.set("style",style);if(location)params.set("location",location);window.history.replaceState(null,"",`/salons${params.size?`?${params}`:""}`);}
  function clear(){setStyle("");setLocation("");setSubmittedStyle("");setSubmittedLocation("");setOrigin(null);setPrice("Any price");setRating("Any rating");setDistance("Any distance");setAvailabilityDate("");}

  return <><form onSubmit={submit} className="relative z-20 rounded-[12px] border border-plum/10 bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(26,18,32,.08)] md:max-w-[1050px] md:p-3"><div className="grid gap-1 md:grid-cols-[1.25fr_.85fr_auto]"><StyleAutocomplete value={style} onChange={setStyle} placeholder="Describe the service you want" className="rounded-[9px] border border-plum/10 px-3"/><LocationAutocomplete value={location} onChange={setLocation} onCoordinates={setOrigin} className="rounded-[9px] border border-plum/10 px-3"/><button className="min-h-10 rounded-[9px] bg-magenta px-8 text-sm font-bold text-white md:min-h-11">Search</button></div></form>
    <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:mt-3 sm:gap-2 sm:pb-2 [&::-webkit-scrollbar]:hidden"><SelectFilter label="Price" value={price} onChange={setPrice} options={["Any price","Under $100","Under $150","$150–$250","$250+"]}/><SelectFilter label="Distance" value={distance} onChange={setDistance} options={["Any distance","< 1 mi","1–2 mi","2–3 mi"]}/><SelectFilter label="Rating" value={rating} onChange={setRating} options={["Any rating","4.8+","4.5+","4.3+","4.0+","Below 4.0"]}/><label className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-[8px] border border-plum/10 bg-white px-3 text-[10px] font-semibold"><CalendarDays size={14}/><span>Availability</span><input type="date" value={availabilityDate} min={new Date().toISOString().slice(0,10)} onChange={(event)=>setAvailabilityDate(event.target.value)} className="bg-transparent outline-none"/></label><button type="button" onClick={clear} className="shrink-0 px-2 text-[11px] font-bold text-magenta">Clear all</button><div className="ml-auto hidden overflow-hidden rounded-[8px] border border-plum/10 md:flex"><Toggle active={view==="list"} onClick={()=>setView("list")} icon={<List size={16}/>} label="List"/><Toggle active={view==="map"} onClick={()=>setView("map")} icon={<Map size={16}/>} label="Map"/></div></div>
    <div className="mt-0.5 grid grid-cols-2 overflow-hidden rounded-[9px] border border-plum/10 md:hidden"><Toggle active={view==="list"} onClick={()=>setView("list")} icon={<List size={16}/>} label="List"/><Toggle active={view==="map"} onClick={()=>setView("map")} icon={<Map size={16}/>} label="Map"/></div>
    <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-0.5 sm:mt-3"><h2 className="font-serif text-[20px] font-semibold text-ink sm:text-[22px]">Salons Near You</h2><span className="inline-flex items-center gap-1 text-[10px] text-ink/65"><MapPin size={12}/>{submittedLocation?`Near ${submittedLocation}`:"Showing available salons"}</span><span className="text-[10px] text-ink/50">{availabilityLoading?"Checking availability...":`${salons.length} matches`}</span></div>
    {view==="map"?<GoogleSalonMap salons={salons}/>:<div className="mt-1 grid gap-4 lg:mt-2 lg:grid-cols-[1.18fr_.92fr]"><div className="space-y-2">{salons.map(salon=><SalonResultCard key={salon.id} salon={salon}/>)}{!salons.length?<Empty/>:null}</div><div className="hidden lg:block"><GoogleSalonMap salons={salons} compact/></div></div>}
  </>;
}

function SalonResultCard({salon}:{salon:DiscoverySalon}){return <article className="grid min-w-0 grid-cols-[118px_1fr] overflow-hidden rounded-[11px] border border-plum/10 bg-white/80 shadow-[0_5px_18px_rgba(26,18,32,.05)] sm:grid-cols-[215px_1fr]"><div className="relative min-h-[155px] bg-blush"><SafeImage src={salon.image} fallbackSrc="/images/salon-warm.jpg" alt={salon.name} className="h-full w-full object-cover"/>{salon.tier.toLowerCase()==="premium"||salon.verified?<span className="absolute left-2 top-2 rounded-full bg-plum px-2 py-1 text-[7px] font-bold uppercase text-white">{salon.tier.toLowerCase()==="premium"?"Premium":"Verified"}</span>:null}<button aria-label={`Favorite ${salon.name}`} className="absolute right-2 top-2 rounded-full bg-white/85 p-1.5"><Heart size={15}/></button></div><div className="grid min-w-0 gap-2 p-3 sm:grid-cols-[1fr_auto] sm:p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1"><h3 className="font-serif text-base font-semibold sm:text-xl">{salon.name}</h3><span className={`rounded-full px-2 py-1 text-[8px] font-bold ${salon.closedToday?"bg-red-100 text-red-700":"bg-blush/55 text-plum"}`}>{salon.statusLabel}</span></div><p className="mt-0.5 text-[9px] text-ink/60">{[salon.city,salon.state].filter(Boolean).join(", ")||"Location not provided"}</p><div className="mt-1.5 flex items-center gap-1.5 text-[9px]">{salon.reviewCount>0&&salon.rating>0?<><Star size={12} className="fill-amber text-amber"/><b>{salon.rating.toFixed(1)}</b><span className="text-ink/50">({salon.reviewCount})</span></>:<span className="rounded-full bg-blush px-2 py-1 font-bold text-plum">New</span>}</div><p className="mt-1.5 text-[10px]">{salon.startingPrice==null?<span className="text-ink/55">Pricing not posted</span>:<>From <b className="text-sm">${salon.startingPrice}</b></>}</p><div className="mt-1.5 hidden flex-wrap gap-2 sm:flex">{salon.verified?<Badge icon={<ShieldCheck size={12}/>} label="Verified"/>:null}{salon.startingPrice!=null?<Badge icon={<Tag size={12}/>} label="Pricing available"/>:null}</div><p className="mt-1.5 hidden items-center gap-1 text-[9px] font-semibold text-magenta sm:inline-flex"><CalendarDays size={12}/>{salon.closedToday?"Bookings resume tomorrow":salon.nextAvailability||"Choose a date to check"}</p></div><div className="flex items-end"><Link href={`/salon/${salon.slug}`} className="inline-flex min-h-9 w-full items-center justify-center rounded-[7px] bg-magenta px-3 text-[10px] font-bold text-white">View salon</Link></div></div></article>}
function Badge({icon,label}:{icon:React.ReactNode;label:string}){return <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-1 text-[8px] text-ink/70">{icon}{label}</span>}
function SelectFilter({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:string[]}){return <label className="shrink-0"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event)=>onChange(event.target.value)} className="min-h-9 rounded-[8px] border border-plum/10 bg-white px-3 text-[10px] font-semibold">{options.map(option=><option key={option}>{option}</option>)}</select></label>}
function Toggle({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}){return <button type="button" onClick={onClick} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 px-5 text-[11px] font-bold ${active?"bg-magenta text-white":"bg-white text-ink"}`}>{icon}{label}</button>}
function Empty(){return <div className="rounded-[12px] border border-dashed border-plum/20 bg-white/70 p-10 text-center text-sm"><h3 className="font-serif text-xl text-plum">No salons found</h3><p className="mt-2 text-ink/60">Try different filters, or choose another date.</p></div>}
