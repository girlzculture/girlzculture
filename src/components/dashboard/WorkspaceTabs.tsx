"use client";
import {useRef} from 'react';

/** Manual activation keeps focus predictable and does not discard a draft.
 * The caller owns URL selection and renders the corresponding real panel. */
export default function WorkspaceTabs({id,label,items,selected,onSelect}:{id:string;label:string;items:readonly {id:string;label:string}[];selected:string;onSelect:(id:string)=>void}){
 const list=useRef<HTMLDivElement>(null);
 return <div ref={list} role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto border-b border-plum/15" onKeyDown={event=>{
  const tabs=Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')||[]);
  const at=tabs.indexOf(event.target as HTMLButtonElement);if(at<0)return;
  const next=event.key==='ArrowRight'?(at+1)%tabs.length:event.key==='ArrowLeft'?(at+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
  if(next>=0){event.preventDefault();tabs[next]?.focus();}
 }}>{items.map(item=><button key={item.id} id={`${id}-tab-${item.id}`} type="button" role="tab" aria-selected={selected===item.id} aria-controls={`${id}-panel-${item.id}`} tabIndex={selected===item.id?0:-1} className={`min-h-11 shrink-0 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-magenta ${selected===item.id?'border-magenta bg-sky-50 text-magenta':'border-transparent gc-text-secondary hover:bg-plum/5'}`} onClick={()=>onSelect(item.id)}>{item.label}</button>)}</div>;
}
