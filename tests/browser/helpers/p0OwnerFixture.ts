import type { Page } from "@playwright/test";
import { buildAuthStorageKeys } from "../../../src/lib/authSessionCore";
import { POLICY_DEFAULTS } from "../../../src/lib/businessPolicyCore";
import { summarizeOperatingBooks, type OperatingBooks } from "../../../src/lib/businessFinanceCore";
import { createHash } from "node:crypto";
import { IMAGE_UPLOAD_PROFILES, type ImagePresetKey } from "../../../src/lib/imageUpload";

/** Browser-only API fixture. The real owner components render real route/state
 * transitions; database authorization/mutation is separately tested in SQL. */
export async function p0OwnerFixture(page: Page, options: { planning?: boolean; populated?: boolean; seedSession?: boolean; locale?: string; actorId?: string; role?: "salon_owner" | "salon_team" | "customer" | "admin" } = {}) {
  const provider = process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL || "http://127.0.0.1:3105";
  if (!["127.0.0.1", "localhost"].includes(new URL(provider).hostname)) throw new Error("P0 browser fixture requires localhost");
  let accountLocale = options.locale || "en";
  const user = { id: options.actorId || "11000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "p0-browser@example.test", app_metadata: { provider: "email" }, user_metadata: { role: options.role || "salon_owner", locale: accountLocale }, created_at: "2026-09-01T00:00:00Z" };
  const session = { access_token: `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 2147483647 })).toString('base64url')}.fixture`, refresh_token: "p0-local-fixture", expires_at: 2147483647, expires_in: 3600, token_type: "bearer", user };
  if (options.seedSession !== false) await page.addInitScript(({ key, session }) => { if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(session)); }, { key: buildAuthStorageKeys(provider).salon, session });
  await page.route(`${provider}/auth/v1/user**`, route => route.fulfill({ json: { ...user, user_metadata: { ...user.user_metadata, locale: accountLocale } } }));
  await page.routeWebSocket(`${provider.replace('http', 'ws')}/realtime/**`, socket => {
    socket.onMessage(raw => {
      const wire = JSON.parse(String(raw));
      const message = Array.isArray(wire) ? { join_ref: wire[0], ref: wire[1], topic: wire[2], event: wire[3], payload: wire[4] } : wire;
      if (message.event !== 'phx_join' && message.event !== 'heartbeat') return;
      const payload = { status: 'ok', response: { postgres_changes: (message.payload?.config?.postgres_changes || []).map((binding: object, index: number) => ({ ...binding, id: index + 1 })) } };
      socket.send(JSON.stringify(Array.isArray(wire) ? [message.join_ref, message.ref, message.topic, 'phx_reply', payload] : { topic: message.topic, event: 'phx_reply', ref: message.ref, payload }));
    });
  });
  const business = { id: "22000000-0000-4000-8000-000000000001", user_id: user.id, name: "Save", description: "Original owner description", slug: "p0-browser", status: "Active", subscription_status: "active", subscription_tier: "Gold", time_zone: "America/New_York", business_policy_revision_id: null as string | null, hours: {}, languages: ["French"], gallery_photos: [] };
  const ids = { category: "33000000-0000-4000-8000-000000000001", group: "33000000-0000-4000-8000-000000000002", master: "33000000-0000-4000-8000-000000000003", service: "33000000-0000-4000-8000-000000000004", professional: "33000000-0000-4000-8000-000000000005", product: "33000000-0000-4000-8000-000000000006", booking: "33000000-0000-4000-8000-000000000007", review: "33000000-0000-4000-8000-000000000008" };
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const appointment = `${tomorrow}T17:00:00.000Z`;
  const records: Record<string, Record<string, unknown>[]> = {
    bookings: [], styles: [], stylists: [], salon_products: [], reviews: [], notifications: [], salon_blockouts: [], salon_promotions: [],
    subscriptions: [{ status: "active", tier: "Gold" }],
  };
  const catalog: Record<string, Record<string, unknown>[]> = { master_styles: [], service_categories: [], service_groups: [], service_addons: [] };
  if (options.populated) {
    const hours = Object.fromEntries(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => [day, { open: '09:00', close: '19:00', closed: false }]));
    Object.assign(business, { hours, address_street: '123 Fixture Street', address_city: 'Miami', address_state: 'Florida', address_zip: '33101', email: 'owner@example.test', phone: '+13055550123' });
    catalog.service_categories = [{ id: ids.category, name: 'Braiding', slug: 'braiding', is_active: true }];
    catalog.service_groups = [{ id: ids.group, name: 'Braids', category_id: ids.category, is_active: true }];
    catalog.master_styles = [{ id: ids.master, name: 'Box Braids', category: 'Braids', category_id: ids.category, service_group_id: ids.group, is_active: true }];
    records.styles = [{ id: ids.service, salon_id: business.id, name: 'Save', description: 'Original service prose — $180 GCABC12', category: 'Braids', category_id: ids.category, service_group_id: ids.group, master_style_id: null, base_price: 180, price_display_min: 180, price_display_max: 180, duration_min_hours: 2, duration_max_hours: 2, buffer_minutes: 15, is_active: true, is_draft: false, photos: [], size_options: [], length_options: [], addons: [], included_items: [] }];
    records.stylists = [{ id: ids.professional, salon_id: business.id, name: 'Save', bio: 'Original professional prose', status: 'Active', is_active: true, availability: hours, specialties: ['Box Braids'], years_experience: 5, photos: [] }];
    records.salon_products = [{ id: ids.product, salon_id: business.id, name: 'Save', description: 'Original product prose', price: 25, stock_quantity: 5, track_inventory: true, is_active: true, product_status: 'Published', pickup_enabled: true, shipping_enabled: false, photos: [], sku: 'GC-FIXTURE-SKU' }];
    records.bookings = [{ customer_id: "11000000-0000-4000-8000-000000000002", duration_hours: 2, id: ids.booking, salon_id: business.id, style_id: ids.service, stylist_id: ids.professional, public_reference: 'GCABC12', guest_name: 'Save', guest_email: 'customer@example.test', appointment_datetime: appointment, status: 'Confirmed', deposit_amount: 18, balance_due: 162, total_amount: 180, booking_policy_snapshot: {}, booking_policy_revision_id: null, created_at: new Date().toISOString() }];
    records.reviews = [{ id: ids.review, salon_id: business.id, booking_id: ids.booking, display_name: 'Save', rating_overall: 5, written_review: 'Original customer review — Save $180', moderation_status: 'Published', verified_booking: true, created_at: new Date().toISOString() }];
  }
  await page.route(`${provider}/rest/v1/**`, route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1) || '';
    if (catalog[table]) return route.fulfill({ json: catalog[table] });
    unexpected.push(`${route.request().method()} REST ${table}`);
    return route.fulfill({ status: 501, json: { code: 'P0_FIXTURE_UNEXPECTED' } });
  });
  let failNextSave = false;
  const conversationMessages = options.populated ? [{ id: '44000000-0000-4000-8000-000000000001', booking_id: ids.booking, sender_role: 'customer', original_body: '  Bonjour Save, rendez-vous GCABC12 à 13:00 pour $180.  ', body: '  Bonjour Save, rendez-vous GCABC12 à 13:00 pour $180.  ', source_locale: 'fr', created_at: new Date().toISOString() }] : [];
  const revisions: { id: string; policy: typeof POLICY_DEFAULTS; version: number | null; source_locale: string; created_at: string; published_at: string | null }[] = [];
  const proposals = new Map<string, Record<string, unknown>>();
  const actions: Record<string, unknown>[] = [];
  const unexpected: string[] = [];
  await page.route("**/api/**", async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    const respond = (json: unknown, status = 200) => route.fulfill({ json, status });
    if (path === "/api/i18n") return route.continue();
    if (path === "/api/i18n/preference") { accountLocale = req.postDataJSON().locale; return respond({ locale: accountLocale }); }
    if (path === "/api/salon/workspace") return respond({ salon: business, isOwner: true, isTeamMember: false, permissions: {}, records });
    if (req.method() === "GET" && /^\/api\/salon\/bookings\/[^/]+\/notes$/.test(path)) return respond({ notes: [] });
    if (path === "/api/salon/actionable-booking-count") return respond({ count: 0 });
    if (req.method() === "GET" && path === "/api/salon/profile") return respond({ salon: business, vanity_request: null });
    if (req.method() === "GET" && path === `/api/salon/bookings/${ids.booking}/reschedule`) return respond({ proposals: [] });
    if (req.method() === "GET" && path === "/api/salon/team") return respond({ users: [], stylists: records.stylists, can_manage: true });
    if (req.method() === "GET" && path === "/api/salon/product-orders") return respond({ orders: [] });
    if (req.method() === "GET" && path === "/api/salon/finances") {
      const query = new URL(req.url()).searchParams;
      if (query.get('options') === 'entry') return respond({ stylists: records.stylists, products: records.salon_products });
      const books: OperatingBooks = { sales: [], payments: [], expenses: [], obligations: [], compensation_payments: [] };
      return respond({ scope: { kind: 'business' }, books, summary: summarizeOperatingBooks(business.id, books, { from: query.get('from')!, to: query.get('to')!, timeZone: business.time_zone }), evidence: {}, stylists: records.stylists, arrangements: [] });
    }
    if (req.method() === "GET" && path === "/api/messages") {
      if (!options.populated) return respond({ threads: [], role: 'salon' });
      const booking = { ...records.bookings[0], salon: business, style: { name: 'Save' } };
      if (new URL(req.url()).searchParams.has('booking_id')) return respond({ booking, messages: conversationMessages, role: 'salon', welcome: { facts: { reference: 'GCABC12', customer_name: 'Save', business_name: 'Save', service_name: 'Save', appointment_datetime: appointment, time_zone: business.time_zone, status: 'Confirmed' } } });
      return respond({ threads: [{ booking, messages: [...conversationMessages].reverse() }], role: 'salon' });
    }
    if (req.method() === 'POST' && path === '/api/messages' && options.populated) {
      const input = req.postDataJSON(); actions.push(input);
      if (input.action === 'translate_display') {
        const translations: Record<string, string> = { en: 'Hello Save, booking GCABC12 at 13:00 for $180.', es: 'Hola Save, reserva GCABC12 a las 13:00 por $180.', wo: 'Salaam Save, réservation GCABC12 ci 13:00 ngir $180.', 'zh-CN': '您好 Save，预约 GCABC12，13:00，$180。' };
        const message = conversationMessages.find(row => row.id === input.message_id);
        if (!message) return respond({ code: 'MESSAGE_NOT_FOUND' }, 404);
        if (message.source_locale === input.locale) return respond({ translation: { translated_body: message.original_body, reviewed: false } });
        if (message.id !== '44000000-0000-4000-8000-000000000001' || !translations[input.locale]) return respond({ code: 'TRANSLATION_UNAVAILABLE' }, 503);
        return respond({ translation: { translated_body: translations[input.locale], reviewed: false } });
      }
      if (!input.action) {
        const message = { id: input.client_request_id, booking_id: ids.booking, original_body: input.body, body: input.body, source_locale: input.source_locale ?? null, source_locale_provenance: input.source_locale ? 'sender_selected' : 'unknown', sender_role: 'salon', created_at: new Date().toISOString() };
        if (!conversationMessages.some(row => row.id === message.id)) conversationMessages.push(message);
        return respond({ message });
      }
    }
    if (req.method() === 'GET' && path === '/api/salon/records' && new URL(req.url()).searchParams.get('table') === 'style_materials') return respond({ records: [] });
    if (path === '/api/salon/records/save' && req.method() === 'POST') {
      const input = req.postDataJSON(); actions.push(input);
      if (failNextSave) { failNextSave = false; return respond({ error: "We couldn't save this change. Please try again.", request_id: 'P0-SAVE-FAILURE' }, 503); }
      if (!records[input.table]) { unexpected.push(`POST record table ${input.table}`); return respond({ code: 'P0_FIXTURE_UNEXPECTED' }, 501); }
      const existing = records[input.table].find(row => row.id === input.id);
      const record = { ...(existing || { id: crypto.randomUUID(), salon_id: business.id }), ...input.values };
      if (existing) Object.assign(existing, record); else records[input.table].push(record);
      return respond({ record, verified: true });
    }
    if (req.method() === "GET" && path === "/api/media/upload") {
      const kind = new URL(req.url()).searchParams.get('kind') as ImagePresetKey;
      if (IMAGE_UPLOAD_PROFILES[kind]) return respond({ profile: IMAGE_UPLOAD_PROFILES[kind] });
    }
    if (path === "/api/config") return respond({ config: {} });
    if (path === "/api/location/resolve") return respond({ location: null, available: false, precision: "city" });
    if (path.startsWith("/api/notifications") || path.startsWith("/api/push")) return respond({ notifications: [], counts: {}, publicKey: "", enabled: false });
    if (path.startsWith("/api/monitoring")) return respond({ request_id: "P0-LOCAL-REFERENCE" });
    if (path === "/api/salon/policies") {
      if (req.method() === "GET") return respond({ revisions, current: business.business_policy_revision_id });
      const input = req.postDataJSON(); actions.push(input);
      if (input.action === "draft") {
        const row = { id: crypto.randomUUID(), policy: input.policy, version: null, source_locale: input.locale, created_at: new Date().toISOString(), published_at: null };
        revisions.push(row);
        return respond({ revision: row, digest: createHash('sha256').update(JSON.stringify(row.policy)).digest('hex'), expected_revision: business.business_policy_revision_id });
      }
      if (input.action === "publish") {
        const row = revisions.find(item => item.id === input.revision_id)!;
        if (!input.confirm || !input.source_reviewed || !row) return respond({ code: "POLICY_INVALID" }, 400);
        row.version = revisions.filter(item => item.published_at).length + 1; row.published_at = new Date().toISOString(); business.business_policy_revision_id = row.id;
        return respond({ revision: row, verified: true });
      }
    }
    if (path === "/api/salon/assistant") {
      const input = req.postDataJSON(); actions.push(input);
      if (input.action === "plan") {
        if (!options.planning) return respond({ code: "ASSISTANT_UNAVAILABLE", request_id: "P0-LOCAL-REFERENCE" }, 503);
        const row = { id: input.request_id, tool: "prepare_business_profile_update", arguments: { field: "description", text: "Texte original vérifié — $180", hours: null }, execution_payload: {}, before_summary: { description: business.description }, result: null, risk_class: 4, digest: "b".repeat(64), confirmed_at: null as string | null };
        proposals.set(input.request_id, row); return respond({ request: row, preview_required: true });
      }
      if (input.action === "confirm") {
        const row = proposals.get(input.request_id);
        if (!row || input.confirm !== true || input.digest !== row.digest) return respond({ code: "ASSISTANT_CONFIRMATION_REQUIRED" }, 409);
        business.description = (row.arguments as { text: string }).text; row.confirmed_at = new Date().toISOString();
        return respond({ verified: true, replayed: false, result: { description: business.description } });
      }
      if (input.action === "tool" && input.tool === "get_business_profile") {
        const row = { id: input.request_id, tool: input.tool, arguments: input.args, execution_payload: {}, before_summary: {}, result: { name: business.name, description: business.description, time_zone: business.time_zone }, risk_class: 1, digest: "a".repeat(64), confirmed_at: null };
        proposals.set(input.request_id, row); return respond({ request: row, preview_required: false });
      }
    }
    unexpected.push(`${req.method()} ${path}`);
    return respond({ code: "P0_FIXTURE_UNEXPECTED" }, 501);
  });
  return { business, revisions, records, ids, conversationMessages, actions, unexpected, session, provider, accountLocale: () => accountLocale, failNextSave: () => { failNextSave = true; } };
}
