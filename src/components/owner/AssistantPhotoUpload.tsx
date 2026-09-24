"use client";
import {useEffect,useRef,useState} from 'react';
import ImageUpload from '@/components/ImageUpload';

import {assistantUploadCopy} from '@/i18n/assistant-photo-upload-copy';
export default function AssistantPhotoUpload({businessId,locale,disabled,onReady}:{businessId:string;locale:string;disabled:boolean;onReady:(url:string,prompt:string)=>void}){
 const [value,setValue]=useState<string|null>(null),alive=useRef(true),seen=useRef<string|null>(null),copy=assistantUploadCopy(locale);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 // One staged file per turn: reusing a single-image field would run its old
 // image replacement cleanup after that file had been attached to the gallery.
 return <details className="rounded-xl border border-border bg-white p-3"><summary data-no-translate className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{copy.title}</summary><p data-no-translate className="mb-3 text-sm">{copy.help}</p>{value?<p data-no-translate role="status" className="text-sm">{copy.staged}</p>:<ImageUpload authScope="salon" bucket="salon-photos" folder={`salons/${businessId}/gallery`} preset="gallery" label={copy.title} value={null} disabled={disabled} onChange={next=>{
  if(!alive.current)return;
  const url=typeof next==='string'?next:null;setValue(url);
  if(url&&seen.current!==url){seen.current=url;onReady(url,copy.request);}
 }}/>}</details>;
}
