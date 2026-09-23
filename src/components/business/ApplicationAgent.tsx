"use client";
import {useState,useRef,useEffect} from 'react';
import Link from 'next/link';
import {useI18n} from '@/components/i18n/LocaleProvider';
import AssistantDictation from '@/components/owner/AssistantDictation';
import {createAuthenticatedApiClient} from '@/lib/scopedApiClient';
import {currentApplicationQuestion,validateInterviewAnswer,capturedInterviewValue,type ApplicationInterview,type InterviewKey} from '@/lib/applicationInterview';
import type {ApplicationFields} from '@/lib/applicationProgress';
import type {SubscriptionPlan} from '@/lib/plans';
type Reply={reply:string|null;value:string|null;field:InterviewKey|null;revision:number;topic:string};
export default function ApplicationAgent({fields,plan,documents,state,revision,isSaved,uploading,onAnswer,onState,onReview,onUpload,onRemove,onBusy}:{fields:ApplicationFields;plan:SubscriptionPlan|null;documents:string[];state:ApplicationInterview;revision:number|null;isSaved:boolean;uploading:boolean;onAnswer:(key:InterviewKey,value:string,state:ApplicationInterview)=>void;onState:(state:ApplicationInterview)=>void;onReview:()=>void;onUpload:(files:FileList|null)=>void;onRemove:(path:string)=>void;onBusy:(value:boolean)=>void}){
 const {translateSource:t}=useI18n(),question=currentApplicationQuestion(fields,state);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(state.failed_message?'The application assistant could not respond. Your draft is safe; retry or continue with the form.':''),[pending,setPending]=useState(state.failed_message||'');
 const scroll=useRef<HTMLDivElement>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[state.turns.length,pending,busy,question?.key]);
 const disabled=busy||uploading||!isSaved;
 function capture(value:string,label?:string){
  if(!question||disabled)return;
  try{
   const checked=question.key==='documents'?value:validateInterviewAnswer(question,value);
   const transcript=label??(question.choices?.find(([key])=>key===checked)?.[1]||checked||'Skipped');
   const next={answered:[...new Set([...state.answered,question.key])],turns:[...state.turns,{role:'assistant' as const,text:t(question.label)},{role:'user' as const,text:question.choices?t(transcript):transcript}]};
   onAnswer(question.key,checked,next);setMessage('');setError('');setPending('');
  }catch(failure){setError(failure instanceof Error?failure.message:'Review your answer.');}
 }
 async function ask(retry=false){
  const text=retry?pending:message.trim();if(!text||disabled||!revision)return;
  setBusy(true);onBusy(true);setError('');setPending(text);setMessage('');
  try{
   const api=await createAuthenticatedApiClient('salon');
   const result=await api.request<Reply>('/api/business/application/assistant',{method:'POST',body:JSON.stringify({message:text,revision}),signal:AbortSignal.timeout(25000)});
   if(!alive.current)return;if(result.revision!==revision||result.field!==(question?.key||null))throw new Error('Your application changed. Reload the saved draft before asking again.');
   if(result.topic==='capture'&&question&&result.value!==null){
    const checked=validateInterviewAnswer(question,result.value);
    onAnswer(question.key,checked,{answered:[...new Set([...state.answered,question.key])],turns:[...state.turns,{role:'assistant',text:t(question.label)},{role:'user',text},{role:'assistant',text:`${t('Captured for review')}: ${question.choices?t(question.choices.find(([v])=>v===checked)?.[1]||checked):checked}`} ]});
   }else if(result.reply){onState({...state,failed_message:undefined,turns:[...state.turns,{role:'user',text},{role:'assistant',text:t(result.reply)}]});}
   else throw new Error('The application assistant could not respond. Your draft is safe; retry or continue with the form.');
   setPending('');
  }catch(failure){if(alive.current){setError(failure instanceof Error?failure.message:'The application assistant could not respond. Your draft is safe; retry or continue with the form.');onState({...state,failed_message:text});}}
  finally{if(alive.current){setBusy(false);onBusy(false);}}
 }
 return <section aria-label={t('Application AI Assistant')} className="rounded-xl border border-magenta/20 bg-white p-4">
  <h2 className="font-serif text-xl">{t('Application AI Assistant')}</h2><p className="mt-2 text-sm text-muted">{t('One question at a time. Your answers use the same private draft as the form. Review everything before submitting.')}</p>
  <div ref={scroll} role="log" aria-live="polite" aria-label={t('Application conversation')} className="my-4 max-h-72 space-y-3 overflow-y-auto overscroll-contain">
   {state.turns.map((turn,index)=><p key={index} translate="no" className={`whitespace-pre-wrap break-words rounded-xl p-3 text-sm ${turn.role==='user'?'ml-6 bg-primary text-white':'mr-6 bg-blush/60'}`}>{turn.text}</p>)}
   {pending?<p translate="no" className="ml-6 whitespace-pre-wrap break-words rounded-xl bg-primary p-3 text-sm text-white">{pending}</p>:null}
   {busy?<p role="status" className="text-sm">{t('Thinking…')}</p>:null}
  </div>
  {question?<fieldset disabled={disabled} className="space-y-3"><legend className="mb-3 font-semibold">{t(question.label)}</legend>
   {question.choices?<div className="flex flex-wrap gap-2">{question.choices.map(([value,label])=><button key={value} type="button" onClick={()=>capture(value)} className="min-h-11 rounded-lg border px-4 py-2">{t(label)}</button>)}</div>:question.key==='documents'?<div><p className="text-sm">{t('Private PDF, JPG, or PNG · up to 10 MB each')}</p><input aria-label={t('Licenses & supporting documents')} type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={e=>onUpload(e.target.files)} className="my-3 block max-w-full text-sm"/>{documents.map((path,i)=><p key={path} className="flex justify-between gap-3 py-2 text-sm">{t('Private document')} {i+1}<button type="button" onClick={()=>onRemove(path)} className="underline">{t('Remove')}</button></p>)}<button type="button" onClick={()=>capture(String(documents.length),`${t('Supporting documents')}: ${documents.length}`)} className="min-h-11 rounded-lg border px-4">{t(documents.length?'Continue':'Skip for now')}</button></div>:null}
   <><label className="block text-sm">{t('Your answer or application question')}<textarea maxLength={2000} rows={3} value={message} onChange={e=>setMessage(e.target.value)} className="mt-2 w-full rounded-lg border p-3"/></label><div className="flex flex-wrap items-center gap-3">{!question.choices&&question.key!=='documents'?<button type="button" onClick={()=>capture(message)} className="min-h-11 rounded-lg bg-primary px-4 text-white">{t('Use this answer')}</button>:null}<button type="button" onClick={()=>void ask()} disabled={!message.trim()} className="min-h-11 rounded-lg border px-4">{t('Ask AI')}</button>{question.optional&&question.key!=='documents'?<button type="button" onClick={()=>capture('')} className="min-h-11 underline">{t('Skip for now')}</button>:null}<AssistantDictation disabled={disabled} sessionKey={state.answered.length} value={message} onChange={setMessage} maxLength={2000}/></div></>
   {question.key!=='documents'&&capturedInterviewValue(fields,plan,question.key,documents)?<button type="button" onClick={()=>capture(capturedInterviewValue(fields,plan,question.key,documents))} className="min-h-11 text-left text-sm underline">{t('Keep saved answer')}: <span translate="no">{capturedInterviewValue(fields,plan,question.key,documents)}</span></button>:null}
  </fieldset>:<button type="button" disabled={disabled} onClick={onReview} className="min-h-11 w-full rounded-lg bg-primary px-5 py-3 text-white">{t('Review & submit')}</button>}
  {uploading?<p role="status">{t('Uploading documents…')}</p>:null}
  {error?<div role="alert" className="mt-3 text-sm"><p>{t(error)}</p>{pending?<button type="button" disabled={disabled} onClick={()=>void ask(true)} className="mt-2 min-h-11 underline">{t('Retry this message')}</button>:null}</div>:null}
  <p className="mt-4 text-sm"><Link href="/contact?topic=business-application" target="_blank" className="underline">{t('Ask our team for help')}</Link></p>
 </section>;
}
