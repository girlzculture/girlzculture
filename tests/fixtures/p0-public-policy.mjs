// Local browser fixture only. Each test owns a unique business UUID so policy
// replacements never change another test or the legacy acceptance salon.
const records = new Map();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const policy = { cancellation_hours: 24, rescheduling_hours: 24, grace_minutes: 15, no_show: 'contact_business', late_arrival: 'contact_business', deposit_treatment: 'platform_rules', balance_due: 'after_service', satisfaction: 'contact_business', preparation: 'Original preparation GC123', guests: 'ask_first', children: 'ask_first', walk_ins: 'ask_first', notes: 'Original business policy GC123' };

export async function p0PublicPolicyFixture(request, response, url, json, readJson) {
  if (url.pathname.startsWith('/__fixtures/p0-public-policy/') && request.method === 'POST') {
    const id = url.pathname.split('/').at(-1);
    if (!uuid.test(id || '') || request.headers['x-acceptance-fixture'] !== 'p0-public-policy') { json(response, 400, { error: 'Invalid isolated policy fixture' }); return true; }
    try {
      const input = await readJson(request);
      if (input.version === null) records.delete(id);
      else if ([1, 2].includes(input.version)) records.set(id, input.version);
      else throw Error('Invalid fixture revision');
      json(response, 200, { ok: true });
    } catch { json(response, 400, { error: 'Invalid policy fixture payload' }); }
    return true;
  }
  if (request.method !== 'GET' || !url.pathname.startsWith('/rest/v1/')) return false;
  const table = url.pathname.split('/').at(-1);
  const id = (url.searchParams.get('slug') || '').replace(/^eq.p0-policy-/, '') || (url.searchParams.get('salon_id') || url.searchParams.get('id') || '').replace(/^eq\./, '');
  let businessId = records.has(id) ? id : null;
  if (table === 'business_policy_revisions') businessId = [...records.keys()].find(key => revisionId(key, records.get(key)) === (url.searchParams.get('id') || '').replace(/^eq\./, '')) || null;
  if (!businessId) return false;
  const version = records.get(businessId);
  const revision = { id: revisionId(businessId, version), salon_id: businessId, version, source_locale: 'en', published_at: '2026-09-01T00:00:00Z', policy: { ...policy, cancellation_hours: version === 1 ? 24 : 72 } };
  const salon = { id: businessId, user_id: null, name: 'P0 Policy Fixture', slug: `p0-policy-${businessId}`, vanity_slug: null, status: 'Active', is_discoverable: true, accepting_bookings: true, subscription_status: 'active', subscription_tier: 'Gold', time_zone: 'America/New_York', description: 'Isolated browser fixture.', address_street: '123 Fixture Street', address_city: 'Miami', address_state: 'FL', address_zip: '33101', gallery_photos: [], hours: {}, business_policy_revision_id: revision.id };
  const style = { id: businessId, salon_id: businessId, name: 'Fixture consultation', category: 'Braiding', service_category: { name: 'Braiding' }, base_price: 0, price_display_min: 0, price_display_max: 0, duration_min_hours: 1, duration_max_hours: 1, is_draft: false, archived_at: null, photos: [], length_options: [], size_options: [], addons: [] };
  const row = table === 'salons' ? salon : table === 'styles' ? style : table === 'business_policy_revisions' ? revision : null;
  const single = String(request.headers.accept || '').includes('application/vnd.pgrst.object+json');
  json(response, 200, single ? row : row ? [row] : [], { 'content-range': row ? '0-0/1' : '0-0/0' });
  return true;
}

export const revisionId = (id, version) => id.slice(0, -4) + String(version).padStart(4, '0');
