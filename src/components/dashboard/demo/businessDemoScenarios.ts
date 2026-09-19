// Explicit demonstration route only. No account IDs, persisted records or providers.
export const DEMO_WEEK = { start: "2026-09-14", end: "2026-09-20", timeZone: "America/New_York" } as const;
export const DEMO_VIEWS = ["overview", "calendar", "services", "team"] as const;
export type DemoView = typeof DEMO_VIEWS[number];
export type DemoScenarioId = "curl-studio" | "braiding-team" | "loc-studio" | "occasion-hair";
export type DemoService = { id: string; name: string; minutes: number; priceCents: number; professionalIds: string[] };
export type DemoProfessional = { id: string; name: string; specialty: string };
export type DemoAppointment = { id: string; serviceId: string; professionalId: string; start: string; client: string; status: "Confirmed" | "Pending" };
export type DemoBlock = { id: string; professionalId: string; start: string; minutes: number; kind: "admin" | "break" | "travel" };
export type DemoScenario = { id: DemoScenarioId; name: string; services: DemoService[]; team: DemoProfessional[]; appointments: DemoAppointment[]; blocks: DemoBlock[] };
const at = (day: number, time: string) => `2026-09-${day}T${time}:00-04:00`;
const appointment = (id: string, day: number, time: string, serviceId: string, professionalId: string, status: DemoAppointment["status"] = "Confirmed"): DemoAppointment => ({ id: `sample-${id}`, serviceId, professionalId, start: at(day, time), client: `Sample client ${id.split("-").at(-1)}`, status });

export const BUSINESS_DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "curl-studio", name: "Curl & Care Studio",
    team: [{ id: "curl-ari", name: "Ari", specialty: "Curl shaping & natural hair" }],
    services: [
      { id: "curl-shape", name: "Curl shape & finish", minutes: 75, priceCents: 9500, professionalIds: ["curl-ari"] },
      { id: "curl-press", name: "Silk press", minutes: 90, priceCents: 9000, professionalIds: ["curl-ari"] },
      { id: "curl-condition", name: "Deep conditioning", minutes: 45, priceCents: 4500, professionalIds: ["curl-ari"] },
      { id: "curl-trim", name: "Maintenance trim", minutes: 30, priceCents: 2500, professionalIds: ["curl-ari"] },
    ],
    appointments: [appointment("curl-A", 14, "09:00", "curl-shape", "curl-ari"), appointment("curl-B", 15, "10:00", "curl-press", "curl-ari"), appointment("curl-C", 15, "13:30", "curl-condition", "curl-ari"), appointment("curl-D", 16, "09:00", "curl-shape", "curl-ari"), appointment("curl-E", 17, "11:30", "curl-trim", "curl-ari"), appointment("curl-F", 18, "10:00", "curl-press", "curl-ari", "Pending")],
    blocks: [{ id: "sample-curl-admin", professionalId: "curl-ari", start: at(16, "11:00"), minutes: 60, kind: "admin" }],
  },
  {
    id: "braiding-team", name: "Braiding Collective",
    team: [{ id: "braid-maya", name: "Maya", specialty: "Knotless & boho braids" }, { id: "braid-zuri", name: "Zuri", specialty: "Cornrows & twists" }, { id: "braid-nia", name: "Nia", specialty: "Twists & protective styling" }],
    services: [
      { id: "braid-knotless", name: "Knotless braids", minutes: 240, priceCents: 22000, professionalIds: ["braid-maya", "braid-nia"] },
      { id: "braid-boho", name: "Boho braids", minutes: 300, priceCents: 28000, professionalIds: ["braid-maya"] },
      { id: "braid-cornrows", name: "Cornrow design", minutes: 120, priceCents: 11000, professionalIds: ["braid-zuri"] },
      { id: "braid-twists", name: "Two-strand twists", minutes: 180, priceCents: 17000, professionalIds: ["braid-zuri", "braid-nia"] },
    ],
    appointments: [appointment("braid-A", 14, "09:00", "braid-knotless", "braid-maya"), appointment("braid-B", 14, "09:00", "braid-cornrows", "braid-zuri"), appointment("braid-C", 15, "09:00", "braid-boho", "braid-maya"), appointment("braid-D", 15, "09:00", "braid-twists", "braid-nia"), appointment("braid-E", 16, "10:00", "braid-twists", "braid-zuri"), appointment("braid-F", 17, "10:00", "braid-knotless", "braid-nia"), appointment("braid-G", 18, "09:00", "braid-boho", "braid-maya", "Pending")],
    blocks: [{ id: "sample-braid-break", professionalId: "braid-maya", start: at(14, "13:00"), minutes: 30, kind: "break" }],
  },
  {
    id: "loc-studio", name: "Loc & Scalp Studio",
    team: [{ id: "loc-dev", name: "Dev", specialty: "Loc maintenance & styling" }, { id: "loc-imani", name: "Imani", specialty: "Starter locs & scalp care" }],
    services: [
      { id: "loc-retwist", name: "Loc retwist", minutes: 90, priceCents: 10000, professionalIds: ["loc-dev", "loc-imani"] },
      { id: "loc-style", name: "Loc styling", minutes: 45, priceCents: 4500, professionalIds: ["loc-dev"] },
      { id: "loc-starter", name: "Starter loc session", minutes: 150, priceCents: 16000, professionalIds: ["loc-imani"] },
      { id: "loc-scalp", name: "Scalp care session", minutes: 30, priceCents: 5500, professionalIds: ["loc-imani"] },
    ],
    appointments: [appointment("loc-A", 14, "09:30", "loc-retwist", "loc-dev"), appointment("loc-B", 14, "10:00", "loc-starter", "loc-imani"), appointment("loc-C", 15, "11:00", "loc-style", "loc-dev"), appointment("loc-D", 16, "09:00", "loc-scalp", "loc-imani"), appointment("loc-E", 17, "10:00", "loc-retwist", "loc-imani"), appointment("loc-F", 18, "13:00", "loc-style", "loc-dev", "Pending")],
    blocks: [{ id: "sample-loc-admin", professionalId: "loc-imani", start: at(16, "10:00"), minutes: 45, kind: "admin" }],
  },
  {
    id: "occasion-hair", name: "Occasion Hair Team",
    team: [{ id: "event-jules", name: "Jules", specialty: "Bridal & occasion hair" }, { id: "event-ren", name: "Ren", specialty: "Event & guest styling" }],
    services: [
      { id: "event-bridal", name: "Bridal styling", minutes: 120, priceCents: 18000, professionalIds: ["event-jules"] },
      { id: "event-guest", name: "Occasion styling", minutes: 60, priceCents: 9500, professionalIds: ["event-jules", "event-ren"] },
      { id: "event-trial", name: "Bridal trial", minutes: 90, priceCents: 12000, professionalIds: ["event-jules"] },
      { id: "event-finish", name: "Event blowout", minutes: 45, priceCents: 7500, professionalIds: ["event-ren"] },
    ],
    appointments: [appointment("event-A", 14, "10:00", "event-trial", "event-jules"), appointment("event-B", 16, "13:00", "event-guest", "event-ren"), appointment("event-C", 18, "09:00", "event-bridal", "event-jules"), appointment("event-D", 18, "09:00", "event-finish", "event-ren"), appointment("event-E", 18, "11:30", "event-guest", "event-ren"), appointment("event-F", 19, "10:00", "event-bridal", "event-jules", "Pending")],
    blocks: [{ id: "sample-event-travel-1", professionalId: "event-ren", start: at(18, "09:45"), minutes: 60, kind: "travel" }, { id: "sample-event-travel-2", professionalId: "event-jules", start: at(18, "11:00"), minutes: 60, kind: "travel" }],
  },
];

export function resolveDemoSelection(scenario?: string | null, view?: string | null) {
  return { scenario: BUSINESS_DEMO_SCENARIOS.find(item => item.id === scenario) || BUSINESS_DEMO_SCENARIOS[0], view: DEMO_VIEWS.includes(view as DemoView) ? view as DemoView : "overview" as DemoView };
}
export function demoDestination(scenario: string, view: string) {
  const safe = resolveDemoSelection(scenario, view);
  return `/site-access/business-demo?${new URLSearchParams({ scenario: safe.scenario.id, view: safe.view })}`;
}
export function demoSummary(scenario: DemoScenario) {
  return scenario.appointments.reduce((sum, item) => {
    const service = scenario.services.find(row => row.id === item.serviceId);
    if (!service) throw new Error("Sample appointment service is missing");
    return { appointments: sum.appointments + 1, valueCents: sum.valueCents + service.priceCents, minutes: sum.minutes + service.minutes, pending: sum.pending + Number(item.status === "Pending") };
  }, { appointments: 0, valueCents: 0, minutes: 0, pending: 0 });
}
export function demoSchedule(scenario: DemoScenario, labels: { admin: string; break: string; travel: string; blocked: string }, professionalId = "") {
  const end = (start: string, minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString();
  return [
    ...scenario.appointments.filter(item => !professionalId || item.professionalId === professionalId).map(item => {
      const service = scenario.services.find(row => row.id === item.serviceId)!;
      const professional = scenario.team.find(row => row.id === item.professionalId)!;
      return { id: item.id, start: item.start, end: end(item.start, service.minutes), title: item.client, subtitle: `${service.name} · ${professional.name}`, status: item.status, kind: "appointment" as const };
    }),
    ...scenario.blocks.filter(item => !professionalId || item.professionalId === professionalId).map(item => ({ id: item.id, start: item.start, end: end(item.start, item.minutes), title: labels[item.kind], subtitle: scenario.team.find(row => row.id === item.professionalId)!.name, status: labels.blocked, kind: "unavailable" as const })),
  ].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
