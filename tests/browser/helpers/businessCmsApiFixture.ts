import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contentCore from "../../../src/lib/businessSignupContent";
import * as publicationCore from "../../../src/lib/contentPublicationCore";
import * as catalogCore from "../../../src/lib/catalogOrdering";
import * as promotionCore from "../../../src/lib/homePromotionCore";

type Row = Record<string, unknown>;
type RouteHandlers = { GET: (request: Request) => Promise<Response>; PUT: (request: Request) => Promise<Response> };

/** Real content GET/PUT handlers with isolated adapters, never a live project. */
export function createBusinessCmsApiFixture(scope: string) {
  const initialSnapshot: Row = {
    slug: "business-signup", title: "Business Signup Landing Page", sections: [],
    labels: { [contentCore.BUSINESS_SIGNUP_CONTENT_LABEL]: contentCore.encodeBusinessSignupContent(contentCore.DEFAULT_BUSINESS_SIGNUP_CONTENT, { forPublication: true }) },
    status: "Published", is_enabled: true, published_at: "2026-09-10T12:00:00.000Z", scheduled_publish_at: null, archived_at: null,
  };
  let record: Row = { ...structuredClone(initialSnapshot), id: "41111111-1111-4111-8111-111111111111", publication_state: "Published", published_payload: structuredClone(initialSnapshot), updated_at: "2026-09-10T12:00:00.000Z" };
  const events: Array<{ action: unknown; before: Row; after: Row }> = [];
  const operationalFailures: unknown[] = [];
  const token = `business-cms-acceptance-${scope}`;
  const publicSnapshot = () => record.is_enabled !== false && !record.archived_at ? publicationCore.retainedPublishedVersion(record)?.payload as Row | undefined ?? null : null;
  const admin = {
    from(table: string) {
      const query = {
        select: () => query,
        order: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: table === "content_pages" ? structuredClone(record) : null, error: null }),
        then: (fulfill: (value: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: table === "content_pages" ? [structuredClone(record)] : [], error: null }).then(fulfill),
      };
      return query;
    },
    async rpc(name: string, params: Row = {}) {
      if (name === "admin_content_link_targets") return { data: [], error: null };
      if (name === "get_public_content_page") return { data: structuredClone(publicSnapshot()), error: null };
      if (name === "admin_save_content_record") {
        if (params.p_record_type !== "page" || params.p_actor_user_id !== "acceptance-content-admin") throw new Error("Unexpected content mutation");
        if (params.p_expected_updated_at !== record.updated_at) return { data: null, error: { message: "CONTENT_REVISION_CONFLICT" } };
        const before = structuredClone(record);
        record = { ...record, ...structuredClone(params.p_record as Row) };
        events.push({ action: params.p_action, before, after: structuredClone(record) });
        return { data: { record: structuredClone(record) }, error: null };
      }
      throw new Error(`Unexpected fixture RPC ${name}`);
    },
  };
  const mocks: Record<string, unknown> = {
    "@/lib/operationalMonitoring": {
      noteOperationalFailure: (...args: unknown[]) => operationalFailures.push(args), routeMonitoringProfile: () => ({}),
      withOperationalMonitoring: (_profile: unknown, handler: unknown) => handler,
    },
    "next/cache": { revalidatePath: () => undefined },
    "@/lib/platformErrors": {
      rejectRequest: (message: string) => { throw new Error(message); },
      monitoredRouteFailure: async ({ error }: { error: Error }) => Response.json({ error: error.message }, { status: /^Forbidden/.test(error.message) ? 403 : 400 }),
    },
    "@/lib/supabaseAdmin": { requireAdminPermission: async (request: Request, permission: string) => {
      if (request.headers.get("authorization") !== `Bearer ${token}` || permission !== "content") throw new Error("Forbidden: Content permission required");
      return { admin, user: { id: "acceptance-content-admin" } };
    } },
    "@/lib/catalogOrdering": catalogCore,
    "@/lib/homePromotionCore": promotionCore,
    "@/lib/contentPublicationCore": publicationCore,
    "@/lib/businessSignupContent": contentCore,
  };
  const mediaFilename = resolve("src/lib/businessSignupMediaValidationServer.ts");
  const mediaModule = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(mediaFilename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: mediaModule, exports: mediaModule.exports, URL, Set, Map, Error,
    require: (name: string) => name === "server-only" ? {} : name === "./businessSignupContent" ? contentCore : (() => { throw new Error(`Unexpected media validation import ${name}`); })(),
  }, { filename: mediaFilename });
  mocks["@/lib/businessSignupMediaValidationServer"] = mediaModule.exports;
  const filename = resolve("src/app/api/admin/content/route.ts");
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const routeModule = { exports: {} as RouteHandlers };
  const nativeRequire = createRequire(filename);
  runInNewContext(compiled, { module: routeModule, exports: routeModule.exports, require: (name: string) => mocks[name] ?? nativeRequire(name), Response, URL, Date, Error, console: { info: () => undefined } }, { filename });
  return {
    token, events, operationalFailures,
    get record() { return structuredClone(record); },
    get published() { return structuredClone(publicSnapshot()); },
    async request(method: "GET" | "PUT", body?: unknown, accessToken = token) {
      return routeModule.exports[method](new Request("http://localhost/api/admin/content", {
        method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }));
    },
  };
}
