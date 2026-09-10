import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { DEFAULT_BUSINESS_SIGNUP_CONTENT } from "../../src/lib/businessSignupContent";
import * as waitlist from "../../src/lib/businessWaitlistCore";
import * as requestSecurity from "../../src/lib/requestSecurity";

const details = {
  intent: "business_waitlist", categoryId: "nail-studio", website: "",
  businessName: "  Polished Studio  ", businessAddress: "123 Main Street, New York, NY 10001",
  businessPhone: "(212) 555-0123", businessEmail: "OWNER@EXAMPLE.TEST",
};
const confirmedTicketId = "72ab377b-d37b-4fde-a7e0-d274e5557c5a";

test("waitlist intake derives its stable business type from published content and preserves all contact details", () => {
  const content = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  content.categories[1].name = "Nail Artists";
  const result = waitlist.validateBusinessWaitlistSubmission({ ...details, categoryName: "Spoofed Hair", mode: "live_application" }, content);
  expect(result.name).toBe("Polished Studio");
  expect(result.email).toBe("owner@example.test");
  expect(result.category).toBe("Partnerships");
  expect(result.subject).toBe("Business waitlist — Nail Artists");
  expect(result.message).toBe([
    "Business type: Nail Artists", "Business category ID: nail-studio", "Business name: Polished Studio",
    "Business address: 123 Main Street, New York, NY 10001", "Business phone number: +12125550123",
    "Business email: owner@example.test", "Please email me when onboarding opens for this business type in my area.",
  ].join("\n"));
});

test("waitlist intake rejects missing, malformed and oversized required contact details", () => {
  for (const field of ["businessName", "businessAddress", "businessPhone", "businessEmail"] as const) {
    for (const value of [undefined, "", " ", null, { value: details[field] }]) {
      expect(() => waitlist.validateBusinessWaitlistContact({ ...details, [field]: value }), `${field}: ${String(value)}`).toThrow(waitlist.BusinessWaitlistValidationError);
    }
  }
  for (const patch of [
    { businessName: "A" }, { businessName: "A".repeat(121) }, { businessAddress: "X" },
    { businessAddress: "A".repeat(501) }, { businessAddress: "123 Main\nBusiness type: forged" },
    { businessPhone: "123" }, { businessPhone: "2125550123 extension words" },
    { businessPhone: "+442071838750" }, { businessEmail: "owner@example" }, { businessEmail: "owner\n@example.test" },
  ]) expect(() => waitlist.validateBusinessWaitlistContact({ ...details, ...patch })).toThrow();
});

test("waitlist intake rejects absent, unknown, hidden, duplicate and live category identifiers", () => {
  const content = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  for (const categoryId of [undefined, "", "not-a-category", ["nail-studio", "barbershop"], "hair-salon-braiding"]) {
    expect(() => waitlist.validateBusinessWaitlistSubmission({ ...details, categoryId }, content)).toThrow(/not accepting/);
  }
  content.categories[1].visible = false;
  expect(() => waitlist.validateBusinessWaitlistSubmission(details, content)).toThrow(/not accepting/);
  content.categories[1].visible = true;
  content.categories[1].mode = "live_application";
  expect(() => waitlist.validateBusinessWaitlistSubmission(details, content)).toThrow(/not accepting/);
  expect(() => waitlist.validateBusinessWaitlistSubmission(details, null)).toThrow(/not accepting/);
});

test("waitlist success requires a confirmed UUID ticket reference", () => {
  expect(waitlist.isConfirmedBusinessWaitlistTicketId(confirmedTicketId)).toBe(true);
  for (const value of [undefined, null, "", " ", "invented-success", "<script>", 123, `${confirmedTicketId} `]) {
    expect(waitlist.isConfirmedBusinessWaitlistTicketId(value)).toBe(false);
  }
});

// Execute the actual route handler with isolated storage dependencies. This
// exercises its validation/persistence boundary without starting an app server
// or sending a request to any Supabase project.
function isolatedSupportRoute(options: { unavailable?: boolean; missingTicket?: boolean; hidden?: boolean; storageFailure?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const moderated: unknown[] = [];
  const failures: unknown[] = [];
  const content = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  if (options.hidden) content.categories[1].visible = false;
  const mocks: Record<string, unknown> = {
    "@/lib/operationalMonitoring": {
      noteOperationalFailure: (...args: unknown[]) => failures.push(args),
      routeMonitoringProfile: () => ({}),
      withOperationalMonitoring: (_profile: unknown, handler: unknown) => handler,
    },
    "@/lib/requestSecurity": requestSecurity,
    "@/lib/engineConfigServer": { getEngineList: async () => ["Partnerships", "Other", "Safety"] },
    "@/lib/contentModerationServer": { moderatePublicContent: async (_admin: unknown, body: unknown) => {
      moderated.push(body);
      return { allowed: true, reason: null, source: "test" };
    } },
    "@/lib/businessSignupContentServer": { getBusinessSignupContent: async (readOptions: { requirePublished?: boolean }) => {
      expect(readOptions).toEqual({ requirePublished: true });
      return options.unavailable ? null : content;
    } },
    "@/lib/businessWaitlistCore": waitlist,
    "@/lib/supabaseAdmin": { getSupabaseAdmin: () => ({ from: (table: string) => {
      expect(table).toBe("support_tickets");
      return { insert: (value: Record<string, unknown>) => {
        inserts.push(value);
        return { select: (columns: string) => {
          expect(columns).toBe("id");
          return { single: async () => ({ data: options.missingTicket ? {} : { id: confirmedTicketId }, error: options.storageFailure ? new Error("Private storage diagnostic") : null }) };
        } };
      } };
    } }) },
  };
  const filename = resolve("src/app/api/support/route.ts");
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const routeModule = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  const nativeRequire = createRequire(filename);
  runInNewContext(compiled, { module: routeModule, exports: routeModule.exports, require: (name: string) => mocks[name] ?? nativeRequire(name), Response, console: { info: () => undefined } }, { filename });
  return {
    inserts, moderated, failures,
    post: (body: Record<string, unknown>) => routeModule.exports.POST(new Request("http://localhost/api/support", {
      method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": crypto.randomUUID() }, body: JSON.stringify(body),
    })),
  };
}

test("support route persists validated waitlist fields through existing moderation and ticket storage", async () => {
  const route = isolatedSupportRoute();
  const response = await route.post(details);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, ticketId: confirmedTicketId });
  expect(route.inserts).toHaveLength(1);
  expect(route.inserts[0]).toMatchObject({ requester_name: "Polished Studio", requester_email: "owner@example.test", category: "Partnerships", status: "Open", content_moderation_status: "Clear" });
  expect(route.inserts[0].message).toContain("Business address: 123 Main Street, New York, NY 10001");
  expect(route.inserts[0].message).toContain("Business phone number: +12125550123");
  expect(route.moderated).toHaveLength(1);
});

test("support route refuses unavailable published content, hidden types, missing details and bots before writing", async () => {
  for (const scenario of [
    { options: { unavailable: true }, body: details, status: 503 },
    { options: { hidden: true }, body: details, status: 400 },
    { options: {}, body: { ...details, businessAddress: "" }, status: 400 },
    { options: {}, body: { ...details, website: "bot.example" }, status: 400 },
  ]) {
    const route = isolatedSupportRoute(scenario.options);
    const response = await route.post(scenario.body);
    expect(response.status).toBe(scenario.status);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).not.toHaveProperty("ok", true);
    expect(route.inserts).toEqual([]);
  }
});

test("support route does not invent waitlist success after storage failure or an absent ticket reference", async () => {
  for (const options of [{ missingTicket: true }, { storageFailure: true }]) {
    const route = isolatedSupportRoute(options);
    const response = await route.post(details);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).not.toHaveProperty("ok", true);
    expect(route.failures).toHaveLength(1);
  }
});

test("general support requests keep their existing contract independently of business content availability", async () => {
  const route = isolatedSupportRoute({ unavailable: true });
  const response = await route.post({ name: "Existing Requester", email: "existing@example.test", category: "Other", subject: "Existing support request", message: "Keep the existing public support behavior.", website: "" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, ticketId: confirmedTicketId });
  expect(route.inserts[0]).toMatchObject({ requester_name: "Existing Requester", category: "Other", subject: "Existing support request", message: "Keep the existing public support behavior." });
});
