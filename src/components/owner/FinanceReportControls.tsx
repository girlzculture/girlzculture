"use client";
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useI18n } from '@/components/i18n/LocaleProvider';
import { createAuthenticatedApiClient } from '@/lib/scopedApiClient';
import { scopedApiErrorMessage } from '@/lib/scopedApiCore';
import { BUSINESS_FINANCE_SOURCE_MESSAGES } from '@/i18n/business-finance-source-catalog';
import type { FinanceReportLocale } from '@/lib/businessFinanceReport';
import { financeButton } from './FinanceUI';

export default function FinanceReportControls({from,to,responseLocale}:{from:string;to:string;responseLocale?:FinanceReportLocale}){
  const {locale:interfaceLocale,translateSource:translate}=useI18n();
  const locale=responseLocale||interfaceLocale;
  const t=(source:string)=>responseLocale?(BUSINESS_FINANCE_SOURCE_MESSAGES[responseLocale]?.[source]||source):translate(source);const [busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false),active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function download(format:'pdf'|'xlsx'){
    if(pending.current)return;pending.current=true;setBusy(true);setError('');
    try{
      const api=await createAuthenticatedApiClient('salon');const mime=format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob=await api.download(`/api/salon/finances/export?${new URLSearchParams({from,to,locale,format})}`,mime);
      if(!active.current)return;
      const href=URL.createObjectURL(blob);const link=document.createElement('a');link.href=href;link.download=`girlz-culture-finances-${from}-${to}-${locale}.${format}`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(href);
    }catch(failure){if(active.current)setError(scopedApiErrorMessage(failure,t('The finance report could not be downloaded.')));}
    finally{pending.current=false;if(active.current)setBusy(false);}
  }
  return <div data-no-translate={responseLocale?true:undefined} className="space-y-2"><div className="flex flex-wrap gap-2">{(['pdf','xlsx'] as const).map(format=><button key={format} type="button" disabled={busy} onClick={()=>void download(format)} className={financeButton}><Download size={16} className="mr-2 inline"/>{t(format==='pdf'?'Download PDF':'Download spreadsheet')}</button>)}</div>{error?<p role="alert" className="text-sm gc-text-danger">{error}</p>:null}<p className="text-xs gc-text-secondary">{t('The PDF contains summaries; the spreadsheet also includes payment and sale records for this period.')}</p></div>;
}
