import { requireSalonOwner } from '@/lib/supabaseAdmin';
import { enforceRateLimit, RateLimitError } from '@/lib/requestSecurity';
import { readBusinessFinances } from '@/lib/businessFinanceServer';
import { validateFinancePeriod } from '@/lib/businessFinanceCore';
import { buildFinanceReport, FINANCE_REPORT_LOCALES, type FinanceReportLocale } from '@/lib/businessFinanceReport';
import { financePdf, financeSpreadsheet } from '@/lib/businessFinanceExportServer';
import { capturePlatformError } from '@/lib/platformErrors';
import { withOperationalMonitoring, routeMonitoringProfile } from '@/lib/operationalMonitoring';

async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  try{
    context=await requireSalonOwner(request);enforceRateLimit(request,`finance-export:${context.user.id}`,10,60_000);
    const query=new URL(request.url).searchParams;const format=query.get('format');const locale=query.get('locale') as FinanceReportLocale;
    if([...query.keys()].some(key=>!['from','to','format','locale'].includes(key))||!['pdf','xlsx'].includes(format||'')||!FINANCE_REPORT_LOCALES.includes(locale))throw Error('FINANCE_INVALID_RECORD');
    const period={from:query.get('from')||'',to:query.get('to')||'',timeZone:String(context.salon.time_zone||'America/New_York')};
    validateFinancePeriod(period);
    // The RPC rechecks owner/earnings/own-stylist access. Front-desk logging is
    // not permission to download totals, even if it can reach this URL.
    const data=await readBusinessFinances(context,period);
    const report=buildFinanceReport({salonId:context.salon.id,business:context.salon.name,scope:data.scope.kind,books:data.books,names:new Map(data.stylists.map(row=>[String(row.id),String(row.name)])),period,locale,generatedAt:new Date().toISOString()});
    const content=format==='pdf'?await financePdf(report):await financeSpreadsheet(report);
    return new Response(new Uint8Array(content),{headers:{...headers,'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="girlz-culture-finances-${period.from}-${period.to}-${locale}.${format}"`}});
  }catch(error){
    const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';
    const status=error instanceof RateLimitError?429:/Unauthorized/.test(message)?401:/ACCESS_DENIED|Forbidden/.test(message)?403:/TOO_LARGE/.test(message)?413:/^FINANCE_/.test(message)?400:500;
    const reference=await capturePlatformError({request,admin:context?.admin,error,feature:'business-finances',action:'export',actorRole:'salon',actorId:context?.user.id,salonId:context?.salon.id,safeMessage:'The finance report could not be downloaded.'});
    return Response.json({code:/^FINANCE_[A-Z_]+$/.test(message)?message:'FINANCE_EXPORT_UNAVAILABLE',request_id:reference},{status,headers:{...headers,'X-Request-ID':reference}});
  }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/finances/export','GET'),handle);
