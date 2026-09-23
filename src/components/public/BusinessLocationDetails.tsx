"use client";
import {MapPin,Navigation} from 'lucide-react';
import {useI18n} from '@/components/i18n/LocaleProvider';
import {publicBusinessLocation,type PublicBusinessLocation} from '@/lib/publicBusinessLocation';
export default function BusinessLocationDetails({location,name}:{location:PublicBusinessLocation;name:string}){
 const {translateSource:t}=useI18n();const details=publicBusinessLocation(location);
 return <>
  <div className="border-plum/10 lg:border-l lg:pl-5" aria-label={t('Appointment location')}>
   <h2 className="flex items-center gap-2 text-sm font-semibold text-plum"><MapPin size={17}/>{t('Location')}</h2>
   <p className="mt-3 text-sm leading-5" translate="no">{details.address}</p>
   {details.privateLocation?<p className="mt-2 text-sm">{t(location.service_location_type==='mobile'?'This professional travels to you.':'The exact address is available after your booking is confirmed.')}</p>:null}
   {details.independent?<p className="mt-2 text-sm">{t('Independent professional')}</p>:null}
   {details.mobile?<div className="mt-2 space-y-1 text-sm"><p>{t('Travels to you')}{details.travelRadius!=null?` · ${details.travelRadius} ${t('miles')}`:''}</p>{details.travelFee!=null?<p>{t('Travel fee')}: <span translate="no">${details.travelFee.toFixed(2)}</span></p>:null}</div>:null}
   {details.mapQuery?<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.mapQuery)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-magenta/25 px-4 text-sm font-semibold text-magenta">{t('Get Directions')}<Navigation size={12}/></a>:null}
  </div>
  {details.mapQuery?<div className="relative min-h-[190px] overflow-hidden rounded-lg border border-plum/10"><iframe title={`${name} ${t('Location')}`} src={`https://www.google.com/maps?q=${encodeURIComponent(details.mapQuery)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0 h-full w-full border-0"/></div>:<div className="flex min-h-32 items-center rounded-lg bg-blush/35 p-5 text-sm">{t(location.service_location_type==='mobile'?'Your visit takes place at the agreed customer location.':'Home studio addresses are shared privately with confirmed customers.')}</div>}
 </>;
}
