"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeft, CalendarDays, Home, Scissors, Users } from "lucide-react";
import WorkspaceCalendar from "@/components/dashboard/WorkspaceCalendar";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { intlLocale } from "@/i18n/catalog";
import { businessDemoCopy } from "@/i18n/business-demo-copy";
import { BUSINESS_DEMO_SCENARIOS, DEMO_WEEK, demoDestination, demoSchedule, demoSummary, resolveDemoSelection, type DemoScenario, type DemoView } from "@/components/dashboard/demo/businessDemoScenarios";

const destinations = [["overview", Home], ["calendar", CalendarDays], ["services", Scissors], ["team", Users]] as const;
const modelKeys = { "curl-studio": "curl", "braiding-team": "braid", "loc-studio": "loc", "occasion-hair": "event" } as const;

// Native history updates keep this route read-only and preserve back/forward,
// without route fetches, account sessions or a separate persisted demo state.
function navigate(scenario: string, view: string) {
  const destination = demoDestination(scenario, view);
  if (window.location.pathname + window.location.search !== destination) window.history.pushState(null, "", destination);
}

function ScenarioWorkspace({ scenario, view }: { scenario: DemoScenario; view: DemoView }) {
  const { locale } = useI18n();
  const copy = businessDemoCopy(locale);
  const [professional, setProfessional] = useState("");
  const [calendarReset, setCalendarReset] = useState(0);
  const model = modelKeys[scenario.id];
  const summary = demoSummary(scenario);
  const number = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 });
  const money = (cents: number) => new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD" }).format(cents / 100);
  const scenarioEvents = demoSchedule(scenario, copy, professional);
  return <div data-no-translate className="gc-dashboard min-h-screen min-w-0 bg-white text-ink lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="gc-workspace-sidebar flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3 lg:block lg:p-5 max-lg:[@media(max-height:600px)]:p-2">
      <Link href="/site-access" prefetch={false} className="hidden min-h-11 items-center gap-2 text-sm font-bold lg:flex"><ArrowLeft size={18} aria-hidden/>{copy.marketplace}</Link>
      <div className="min-w-0"><p className="text-lg font-bold lg:mt-3 lg:text-xl">Girlz Culture</p><p className="text-xs lg:mt-1 lg:text-sm">{copy.sample}</p></div>
      <nav className="order-last flex w-full min-w-0 flex-wrap gap-1 sm:order-none sm:flex-1 lg:mt-4 lg:flex-col lg:gap-2" aria-label={copy.pages}>
        {destinations.map(([id, Icon]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => navigate(scenario.id, id)} className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold ${view === id ? "bg-primary-hover text-white" : "text-white hover:bg-white/10"}`}><Icon size={18} aria-hidden/>{copy[id]}</button>)}
      </nav>
      <details className="relative ml-auto shrink-0 lg:hidden"><summary className="flex min-h-11 cursor-pointer items-center rounded-lg border border-white/40 px-3 text-sm font-semibold">{copy.more}</summary><div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-white p-2 text-ink shadow-lg"><Link href="/site-access" prefetch={false} className="flex min-h-11 items-center px-2 text-sm font-bold">{copy.marketplace}</Link><Link href="/salon/login" prefetch={false} className="flex min-h-11 items-center px-2 text-sm font-bold">{copy.account}</Link></div></details>
      <Link href="/salon/login" prefetch={false} className="mt-8 hidden min-h-11 items-center text-sm font-bold underline lg:inline-flex">{copy.account}</Link>
    </aside>
    <main className="min-w-0 space-y-3 p-3 sm:p-4 lg:space-y-5 lg:p-8 max-lg:[@media(max-height:600px)]:space-y-2 max-lg:[@media(max-height:600px)]:p-2">
      <header className="space-y-2 lg:space-y-3">
        <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-cols-1">
          <div><label className="sr-only text-sm font-semibold lg:not-sr-only lg:mb-2 lg:block" htmlFor="demo-scenario">{copy.choose}</label><select id="demo-scenario" value={scenario.id} onChange={event => navigate(event.target.value, view)} className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm lg:max-w-lg">{BUSINESS_DEMO_SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div role="note" className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs leading-5"><strong className="block">{copy.readOnly}</strong><span>{copy.period}</span></div>
          <details className="relative rounded-lg border border-border bg-white lg:max-w-3xl"><summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">{copy.details}</summary><div className="space-y-2 border-t border-border bg-white p-3 text-sm leading-6 sm:absolute sm:right-0 sm:z-20 sm:mt-1 sm:w-96 sm:rounded-xl sm:border sm:shadow-lg lg:static lg:mt-0 lg:w-auto lg:rounded-none lg:border-0 lg:border-t lg:shadow-none"><p><strong>{copy.notice}.</strong> {copy.disclaimer}</p><p className="font-semibold text-teal">{copy[`${model}Model`]}</p><p>{copy[`${model}Description`]}</p><p>{copy.names}</p><p>{copy.calendarNote}</p></div></details>
        </div>
        <h1 className="text-xl lg:text-3xl max-lg:[@media(max-height:600px)]:sr-only">{scenario.name}</h1>
        <h2 className="sr-only text-xl lg:not-sr-only" aria-live="polite">{copy[view]}</h2>
      </header>

      {view === "overview" ? <>
        <section aria-label={copy.totals}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[[copy.appointments, number.format(summary.appointments)], [copy.value, money(summary.valueCents)], [copy.hours, number.format(summary.minutes / 60)], [copy.menuCount, number.format(scenario.services.length)]].map(([label, value]) => <article className="gc-stat min-w-0" key={label}><p className="break-words">{label}</p><strong className="break-words">{value}</strong></article>)}
          </div>
          <p className="mt-3 text-sm leading-6">{copy.valueNote}</p>
          <p className="mt-1 text-sm">{copy.pending}: {number.format(summary.pending)} · {copy.teamCount}: {number.format(scenario.team.length)}</p>
        </section>
        <section className="gc-panel" aria-labelledby="demo-operating"><h3 id="demo-operating" className="text-xl">{copy.operating}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6"><li>{copy[`${model}Focus1`]}</li><li>{copy[`${model}Focus2`]}</li></ul>
          <div className="mt-4 flex flex-wrap gap-2" aria-label={copy.explore}>{([["calendar", copy.reviewCalendar], ["services", copy.reviewServices], ["team", copy.reviewTeam]] as const).map(([target, label]) => <button type="button" key={target} onClick={() => navigate(scenario.id, target)} className="min-h-11 rounded-lg border border-teal px-3 text-sm font-semibold text-teal">{label}</button>)}</div>
        </section>
      </> : null}

      {view === "calendar" || view === "overview" ? <section aria-label={copy.calendar} className="min-w-0 space-y-3 max-lg:[@media(max-height:600px)]:space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 text-sm font-semibold sm:max-w-sm"><span className="max-lg:[@media(max-height:600px)]:sr-only">{copy.professional}</span><select value={professional} onChange={event => setProfessional(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-white px-3 text-sm max-lg:[@media(max-height:600px)]:mt-0"><option value="">{copy.allTeam}</option>{scenario.team.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <button type="button" onClick={() => setCalendarReset(value => value + 1)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">{copy.resetDate}</button>
        </div>
        <WorkspaceCalendar key={`${scenario.id}-${calendarReset}`} title={copy.sampleCalendar} timeZone={DEMO_WEEK.timeZone} initialDate={DEMO_WEEK.start} compactHeader eventTitleFirst events={scenarioEvents}/>
      </section> : null}

      {view === "services" ? <section aria-labelledby="demo-menu"><h3 id="demo-menu" className="mb-3 text-xl">{copy.menu}</h3><ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{scenario.services.map(service => <li key={service.id} className="gc-panel min-w-0"><article><Scissors className="text-teal" size={22} aria-hidden/><h4 className="mt-3 text-lg">{service.name}</h4><p className="mt-2 text-sm">{number.format(service.minutes)} {copy.minutes}</p><p className="mt-2 text-sm">{copy.price}: <strong>{money(service.priceCents)}</strong></p><p className="mt-3 text-xs leading-5">{copy.offeredBy}: {service.professionalIds.map(id => scenario.team.find(person => person.id === id)!.name).join(", ")}</p></article></li>)}</ul></section> : null}

      {view === "team" ? <section aria-labelledby="demo-team"><h3 id="demo-team" className="mb-3 text-xl">{copy.sampleTeam}</h3><ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{scenario.team.map(person => <li key={person.id} className="gc-panel min-w-0"><article><span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-teal/10 text-lg font-bold">{person.name[0]}</span><h4 className="mt-3 text-lg">{person.name}</h4><p className="mt-1 text-sm">{person.specialty}</p><p className="mt-2 text-xs">{copy.sampleRole}</p><h5 className="mt-4 text-sm font-semibold">{copy.assigned}</h5><ul className="mt-2 list-disc space-y-2 pl-4 text-sm">{scenario.services.filter(service => service.professionalIds.includes(person.id)).map(service => <li key={service.id}>{service.name}</li>)}</ul></article></li>)}</ul></section> : null}

      <section className="gc-panel" aria-labelledby="demo-real-tools"><h3 id="demo-real-tools" className="text-lg">{copy.assistant}</h3><p className="mt-2 text-sm leading-6">{copy.assistantNote}</p><Link href="/salon/login" prefetch={false} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-teal px-4 text-sm font-bold text-white">{copy.account}</Link></section>
    </main>
  </div>;
}

function DemoSelection() {
  const search = useSearchParams();
  const { scenario, view } = resolveDemoSelection(search.get("scenario"), search.get("view"));
  return <ScenarioWorkspace key={scenario.id} scenario={scenario} view={view}/>;
}

export default function DemoBusinessWorkspace() {
  const { locale } = useI18n();
  return <Suspense fallback={<p role="status" className="p-6" data-no-translate>{businessDemoCopy(locale).loading}</p>}><DemoSelection/></Suspense>;
}
