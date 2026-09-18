import {validateFinancePeriod} from './businessFinanceCore';

export const FINANCE_TABS = ['overview','transactions','expenses','team','reports','settings'] as const;
export type FinanceTab = typeof FINANCE_TABS[number];
export function financeWorkspaceState(params: Pick<URLSearchParams,'get'>, today:string, timeZone:string) {
  const requested=params.get('finance');
  const tab=FINANCE_TABS.includes(requested as FinanceTab)?requested as FinanceTab:'overview';
  let from=params.get('finance_from')||today.slice(0,8)+'01',to=params.get('finance_to')||today;
  try {validateFinancePeriod({from,to,timeZone});} catch {from=today.slice(0,8)+'01';to=today;}
  return {tab,from,to,search:(params.get('finance_search')||'').slice(0,160),balance:params.get('finance_balance')==='unpaid'?'unpaid':'all'};
}

/** Native history is integrated with Next's useSearchParams. Preserve other
 * workspace context, and never persist business records or drafts in the URL. */
export function updateFinanceLocation(values:Record<string,string>,replace=false) {
  const url=new URL(window.location.href);
  for(const [key,value] of Object.entries(values)) {
    if(!key.startsWith('finance'))throw Error('FINANCE_INVALID_LOCATION');
    if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
  }
  window.history[replace?'replaceState':'pushState'](null,'',url.pathname+url.search+url.hash);
}
