"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BUNDLED_MESSAGES, ENGLISH_MESSAGES, INTL_LOCALES, normalizeLocale, type AppLocale } from "@/i18n/catalog";

type I18nContextValue={locale:AppLocale;setLocale:(locale:AppLocale)=>void;t:(key:string,fallback?:string,values?:Record<string,string|number>)=>string;formatDate:(value:Date|string|number,options?:Intl.DateTimeFormatOptions)=>string;formatNumber:(value:number,options?:Intl.NumberFormatOptions)=>string;formatCurrency:(value:number,currency?:string)=>string};
const Context=createContext<I18nContextValue|null>(null);

export default function LocaleProvider({children,initialLocale="en"}:{children:React.ReactNode;initialLocale?:string}){
  const[locale,setLocaleState]=useState<AppLocale>(()=>normalizeLocale(initialLocale)); const[remote,setRemote]=useState<Record<string,string>>({});
  const setLocale=useCallback((next:AppLocale)=>{const safe=normalizeLocale(next);setLocaleState(safe);document.documentElement.lang=safe;try{localStorage.setItem("girlz-culture-locale",safe)}catch{}document.cookie=`gc_locale=${safe}; Path=/; Max-Age=31536000; SameSite=Lax`;},[]);
  useEffect(()=>{let saved="";try{saved=localStorage.getItem("girlz-culture-locale")||""}catch{}if(!saved||normalizeLocale(saved)===locale)return;const timer=window.setTimeout(()=>setLocaleState(normalizeLocale(saved)),0);return()=>window.clearTimeout(timer)},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{document.documentElement.lang=locale;const controller=new AbortController();void fetch(`/api/i18n?locale=${locale}`,{signal:controller.signal}).then(response=>response.ok?response.json():null).then(body=>setRemote(body?.messages&&typeof body.messages==="object"?body.messages:{})).catch(()=>setRemote({}));return()=>controller.abort()},[locale]);
  const t=useCallback((key:string,fallback="",values:Record<string,string|number>={})=>{let text=remote[key]||BUNDLED_MESSAGES[locale]?.[key]||ENGLISH_MESSAGES[key]||fallback||"";for(const[name,value]of Object.entries(values))text=text.replaceAll(`{${name}}`,String(value));return text},[locale,remote]);
  const value=useMemo<I18nContextValue>(()=>({locale,setLocale,t,formatDate:(input,options)=>new Intl.DateTimeFormat(INTL_LOCALES[locale],options).format(new Date(input)),formatNumber:(input,options)=>new Intl.NumberFormat(INTL_LOCALES[locale],options).format(input),formatCurrency:(input,currency="USD")=>new Intl.NumberFormat(INTL_LOCALES[locale],{style:"currency",currency}).format(input)}),[locale,setLocale,t]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n(){const value=useContext(Context);if(!value)throw new Error("useI18n must be used inside LocaleProvider.");return value}
