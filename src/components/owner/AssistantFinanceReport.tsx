import {assistantReportPeriod} from '@/lib/assistantReportPeriod';
import {isAssistantLanguage} from '@/lib/assistantLanguage';
import FinanceReportControls from './FinanceReportControls';

export default function AssistantFinanceReport({value,locale}:{value:unknown;locale:string}){
  const period=assistantReportPeriod(value);
  if(!period||(!isAssistantLanguage(locale)||locale==="wo"))return null;
  return <section className="rounded-xl border border-border bg-white p-3 sm:ml-11">
    <p data-no-translate className="mb-2 text-sm">{period.from} – {period.to} · {period.timeZone}</p>
    <FinanceReportControls from={period.from} to={period.to} responseLocale={locale}/>
  </section>;
}
