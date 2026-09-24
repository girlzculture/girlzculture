"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {GcAssistantLauncher,useAssistantBusinessBinding} from "@/components/owner/GcAssistant";
import type {AssistantBusinessContext} from "@/lib/assistantAppearance";
import Link from 'next/link';
import Image from 'next/image';
import {bundledImageSource} from '@/lib/bundledImageSource';
import {getSessionForScope} from '@/lib/supabase';
import {readOwnerResponse,OwnerActionError} from '@/lib/ownerActionError';
import {useI18n} from '@/components/i18n/LocaleProvider';
import {RoleSessionBoundary} from '@/components/auth/RoleLogoutButton';
import BusinessPolicyDisclosure, {type PolicyDisclosure} from "@/components/booking/BusinessPolicyDisclosure";

type RecordRow={id:string;name:string;description?:string;bio?:string;photos?:string[];base_price?:number;duration_min_hours?:number;duration_max_hours?:number};
type Preview={sample:true;assistant:AssistantBusinessContext;business:{name:string;description:string;cover:string;photos:string[];city:string};services:RecordRow[];team:RecordRow[];policy?:PolicyDisclosure|null};
export default function PrivateDemoPage(){
 const {translateSource:t,formatCurrency}=useI18n();const [data,setData]=useState<Preview|null>(null),[reference,setReference]=useState(''),[failed,setFailed]=useState(false),[loading,setLoading]=useState(true);
 const bindAssistant=useAssistantBusinessBinding();
 useEffect(()=>{if(data?.assistant)bindAssistant?.(data.assistant);},[data,bindAssistant]);
 const inFlight=useRef<Promise<Preview>|null>(null),mounted=useRef(false);
 const load=useCallback(async()=>{
  // Share the pending read across repeated effect setup. A second response
  // must not hide a failure before the owner has chosen to retry it.
  if(!inFlight.current)inFlight.current=(async()=>{
   const session=await getSessionForScope('salon');if(!session)throw Error('AUTH_REQUIRED');
   return readOwnerResponse(await fetch('/api/salon/demo-page',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'}),'DEMO_PREVIEW_UNAVAILABLE');
  })();
  const request=inFlight.current;
  try{const result=await request;if(mounted.current)setData(result);}
  catch(error){if(mounted.current){setFailed(true);setReference(error instanceof OwnerActionError?error.reference:'');}}
  finally{if(inFlight.current===request)inFlight.current=null;if(mounted.current)setLoading(false);}
 },[]);
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;};},[load]);
 return <main className="gc-dashboard min-h-screen bg-white text-ink"><RoleSessionBoundary scope="salon"/><div className="mx-auto max-w-6xl px-4 py-6"><div className="flex flex-wrap items-center justify-between gap-3"><Link href="/salon/dashboard/my-page" className="inline-flex min-h-11 items-center font-semibold text-primary">← {t('My Page')}</Link><GcAssistantLauncher/></div><aside className="my-4 rounded-xl border border-amber-300 bg-amber-50 p-4"><h1 className="font-serif text-2xl">{t('Private demonstration — sample data')}</h1><p>{t('This page is visible only inside the sample workspace. It cannot accept customer bookings or payments.')}</p></aside>
 {loading?<p role="status">{t('Loading...')}</p>:failed?<div role="alert"><p>{t('The private demo page could not load. Try again.')}</p>{reference?<p>{t('Support reference')}: <span data-no-translate>{reference}</span></p>:null}<button className="min-h-11 rounded-lg border px-4" onClick={()=>{setLoading(true);setFailed(false);void load();}}>{t('Try again')}</button></div>:data?<>
 <article className="overflow-hidden rounded-2xl border border-border"><Image unoptimized src={bundledImageSource(data.business.cover)} alt="" width={1200} height={430} className="h-48 w-full object-cover sm:h-80"/><div className="space-y-3 p-5 sm:p-8"><h2 data-no-translate className="font-serif text-3xl">{data.business.name}</h2><p data-no-translate>{data.business.city}</p><p data-no-translate>{data.business.description}</p></div></article>
 <section className="my-8"><h2 className="mb-4 font-serif text-2xl">{t('Services & Pricing')}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.services.map(row=><article key={row.id} className="overflow-hidden rounded-xl border border-border">{row.photos?.[0]?<Image unoptimized src={bundledImageSource(row.photos[0])} alt="" width={480} height={300} className="h-44 w-full object-cover"/>:null}<div className="space-y-2 p-4"><h3 data-no-translate className="font-semibold">{row.name}</h3><p>{formatCurrency(Number(row.base_price||0))} · {row.duration_min_hours}–{row.duration_max_hours} {t('hours')}</p><p data-no-translate className="text-sm">{row.description}</p></div></article>)}</div></section>
 <BusinessPolicyDisclosure revision={data.policy||null} businessName={data.business.name}/>
 <section><h2 className="mb-4 font-serif text-2xl">{t('Team')}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{data.team.map(row=><article key={row.id} className="rounded-xl border border-border p-4"><h3 data-no-translate className="font-semibold">{row.name}</h3><p data-no-translate className="mt-2 text-sm">{row.bio}</p></article>)}</div></section>
 </>:null}</div></main>;
}
