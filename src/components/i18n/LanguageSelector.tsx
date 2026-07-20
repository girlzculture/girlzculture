"use client";
import { Languages } from "lucide-react";
import { LOCALE_NAMES, SUPPORTED_LOCALES, type AppLocale } from "@/i18n/catalog";
import { useI18n } from "@/components/i18n/LocaleProvider";
export default function LanguageSelector({compact=false,className=""}:{compact?:boolean;className?:string}){const{locale,setLocale,t}=useI18n();return <label className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-plum/15 bg-white/80 px-2 text-[10px] font-bold text-plum ${className}`}><Languages size={14}/><span className={compact?"sr-only":"hidden xl:inline"}>{t("common.language","Language")}</span><select aria-label={t("common.language","Language")} value={locale} onChange={event=>setLocale(event.target.value as AppLocale)} className="bg-transparent outline-none">{SUPPORTED_LOCALES.map(code=><option key={code} value={code}>{LOCALE_NAMES[code]}</option>)}</select></label>}
export function LocalizedText({messageKey,fallback,values}:{messageKey:string;fallback:string;values?:Record<string,string|number>}){const{t}=useI18n();return <>{t(messageKey,fallback,values)}</>}
