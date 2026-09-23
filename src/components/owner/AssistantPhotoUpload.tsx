"use client";
import {useEffect,useRef,useState} from 'react';
import ImageUpload from '@/components/ImageUpload';

export const assistantUploadCopy=(locale:string)=>{
 const index=locale==='fr'?1:locale==='es'?2:locale==='zh-CN'?3:0;
 return {title:['Add a photo','Ajouter une photo','Añadir una foto','添加照片'][index],
  help:['Choose and crop a photo, then review before adding it to your gallery.','Choisissez et recadrez une photo, puis vérifiez-la avant de l’ajouter à votre galerie.','Elige y recorta una foto y revísala antes de añadirla a tu galería.','选择并裁剪照片，然后审核后再添加到图库。'][index],
  request:['Review adding this uploaded photo to my gallery.','Vérifier l’ajout de cette photo à ma galerie.','Revisar la incorporación de esta foto a mi galería.','审核将这张已上传的照片添加到我的图库。'][index],
  staged:['Photo uploaded. Review the change below.','Photo importée. Vérifiez la modification ci-dessous.','Foto subida. Revisa el cambio a continuación.','照片已上传。请审核下方的更改。'][index]};
};
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
