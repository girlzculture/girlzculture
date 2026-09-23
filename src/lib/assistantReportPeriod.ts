import {validateFinancePeriod,type FinancePeriod} from '@/lib/businessFinanceCore';

/** UI reads only the authenticated tool result, never dates/links invented in
 * model prose. The download endpoint independently resolves fresh authority. */
export function assistantReportPeriod(value:unknown):FinancePeriod|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const result=value as Record<string,unknown>;
  if(!['authenticated_business_only','own_stylist_only'].includes(String(result.scope)))return null;
  if(!result.period||typeof result.period!=='object'||Array.isArray(result.period))return null;
  const p=result.period as Record<string,unknown>;
  if(typeof p.from!=='string'||typeof p.to!=='string'||typeof p.timeZone!=='string')return null;
  const period={from:p.from,to:p.to,timeZone:p.timeZone};
  try{validateFinancePeriod(period);return period;}catch{return null;}
}
