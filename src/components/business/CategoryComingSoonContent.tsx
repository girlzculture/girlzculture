"use client";
import Link from "next/link";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {categoryOpeningMessage,type BusinessCategory} from "@/lib/businessCategories";
import NearbySalonPlacement from "@/components/public/NearbySalonPlacement";
import SafeImage from "@/components/site/SafeImage";
export function CategoryOpeningMessage({name}:{name:string}){
 const {translateSource:t}=useI18n();return <>{t(categoryOpeningMessage("{category}"),{category:t(name)})}</>;
}
export default function CategoryComingSoonContent({category,browsing}:{category:BusinessCategory;browsing:boolean}){
 const {translateSource:t}=useI18n();
 return <><section className="mx-auto grid max-w-6xl gap-7 px-5 py-10 md:grid-cols-2 md:items-center md:py-16">
  <div><p className="text-sm font-semibold uppercase tracking-widest text-magenta">{t("Coming soon")}</p><h1 className="mt-3 font-serif text-4xl sm:text-6xl">{t(category.name)}</h1><p className="mt-6 max-w-xl text-base leading-7"><CategoryOpeningMessage name={category.name}/></p><Link href={`/business/waitlist?category=${category.slug}`} className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-magenta px-6 font-semibold text-white">{t("Join the business waitlist")}</Link></div>
  <div className="relative aspect-[4/3] overflow-hidden rounded-3xl"><SafeImage src={`/images/business/${category.photo}-service.jpg`} fallbackSrc={`/images/business/${category.photo}-service.jpg`} alt="" className="h-full w-full object-cover"/></div>
 </section><div className="mx-auto max-w-6xl px-5 pb-10">{browsing?<NearbySalonPlacement title={t("Available Hair & Braiding Businesses")} description={t("Explore the businesses currently available in your area.")}/>:<section className="rounded-2xl border border-plum/10 bg-white p-6"><h2 className="font-serif text-2xl">{t("Hair & Braiding")}</h2><p className="mt-2 text-sm">{t("Discover hair and braiding businesses in your area.")}</p><Link className="mt-4 inline-block font-semibold text-magenta underline" href="/site-access">{t("Explore available hair and braiding businesses")}</Link></section>}</div></>;
}
