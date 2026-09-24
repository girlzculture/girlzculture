// Local browser fixture only. Each test owns a unique business UUID so policy
// replacements never change another test or the legacy acceptance salon.
const records = new Map();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const policy = { refund_satisfaction: 'case_by_case', refund_terms: 'Contact the business about payments handled directly by it.', cancellation_hours: 24, rescheduling_hours: 24, grace_minutes: 15, no_show: 'contact_business', late_arrival: 'contact_business', deposit_treatment: 'platform_rules', balance_due: 'after_service', satisfaction: 'contact_business', preparation: 'Original preparation GC123', guests: 'ask_first', children: 'ask_first', walk_ins: 'ask_first', notes: 'Original business policy GC123' };

export async function p0PublicPolicyFixture(request, response, url, json, readJson) {
  if (url.pathname.startsWith('/__fixtures/p0-public-policy/') && request.method === 'POST') {
    const id = url.pathname.split('/').at(-1);
    if (!uuid.test(id || '') || request.headers['x-acceptance-fixture'] !== 'p0-public-policy') { json(response, 400, { error: 'Invalid isolated policy fixture' }); return true; }
    try {
      const input = await readJson(request);
      if (input.version === null) records.delete(id);
      else if ([1, 2].includes(input.version)) {
        // Carry the exact owner-reviewed revision into the existing isolated
        // public fixture. This branch is reached only by the localhost test
        // harness above; it is not an application policy mutation endpoint.
        let publishedRevision = null;
        if (input.published_revision !== undefined) {
          const revision = input.published_revision;
          if (!revision || revision.id !== revisionId(id, input.version) || revision.salon_id !== id || revision.version !== input.version
            || !['en', 'fr', 'es', 'zh-CN'].includes(revision.source_locale) || typeof revision.published_at !== 'string' || !Number.isFinite(Date.parse(revision.published_at))
            || !revision.policy || typeof revision.policy !== 'object' || Array.isArray(revision.policy)) throw Error('Invalid connected fixture revision');
          publishedRevision = { id: revision.id, salon_id: id, version: revision.version, source_locale: revision.source_locale, published_at: revision.published_at, policy: revision.policy };
        }
        const depositRate=input.deposit_rate??10;if(typeof depositRate!=='number'||depositRate<0||depositRate>80)throw Error('Invalid deposit fixture');
        records.set(id, {depositRate,version:input.version,priced:input.priced===true,assignments:input.assignments===true,marketing:input.marketing===true,mobile:input.mobile===true,publishedRevision});
      }
      else throw Error('Invalid fixture revision');
      json(response, 200, { ok: true });
    } catch { json(response, 400, { error: 'Invalid policy fixture payload' }); }
    return true;
  }
  if(request.method==='POST'&&url.pathname==='/rest/v1/rpc/public_business_marketing_posts'){
    const input=await readJson(request),id=input.p_salon,record=records.get(id);
    const copies=Object.fromEntries(['en','fr','es','zh-CN'].map(locale=>[locale,{title:'Owner approved GC123',body:`${locale} · Fixture consultation · USD 100.00 · owner-reviewed copy.`,tags:['#GirlzCulture']}]));
    json(response,200,record?.marketing&&record.version===1?[{id:revisionId(id,175),copies,photos:[{url:'https://maps.gstatic.com/gc-marketing-fixture/marketing-before.svg',title:'Owner approved before'},{url:'https://maps.gstatic.com/gc-marketing-fixture/marketing-after.svg',title:'Owner approved after'}],booking_path:`/salon/p0-policy-${id}/book?style=${id}`,published_at:'2026-09-19T12:00:00Z'}]:[]);return true;
  }
  if (request.method !== 'GET' || !url.pathname.startsWith('/rest/v1/')) return false;
  const table = url.pathname.split('/').at(-1);
  const id = (url.searchParams.get('slug') || '').replace(/^eq.p0-policy-/, '') || (url.searchParams.get('salon_id') || url.searchParams.get('id') || '').replace(/^eq\./, '');
  let businessId = records.has(id) ? id : null;
  if (table === 'business_policy_revisions') businessId = [...records.keys()].find(key => revisionId(key, records.get(key).version) === (url.searchParams.get('id') || '').replace(/^eq\./, '')) || null;
  if (!businessId) return false;
  const {version,priced,assignments,mobile,publishedRevision,depositRate} = records.get(businessId);
  const revision = publishedRevision || { id: revisionId(businessId, version), salon_id: businessId, version, source_locale: 'en', published_at: '2026-09-01T00:00:00Z', policy: { ...policy, cancellation_hours: version === 1 ? 24 : 72 } };
  const salon = { id: businessId, user_id: null, name: 'P0 Policy Fixture', slug: `p0-policy-${businessId}`, vanity_slug: null, status: 'Active', is_discoverable: true, accepting_bookings: true, subscription_status: 'active', subscription_tier: 'Gold', time_zone: 'America/New_York', description: 'Isolated browser fixture.', address_street: '123 Fixture Street', address_city: 'Miami', address_state: 'FL', address_zip: '33101', gallery_photos: [], hours: {}, business_policy_revision_id: revision.id };
  const style = { id: businessId, salon_id: businessId, name: 'Fixture consultation', category: 'Braiding', service_category: { name: 'Braiding' }, base_price: 0, price_display_min: 0, price_display_max: 0, duration_min_hours: 1, duration_max_hours: 1, is_draft: false, archived_at: null, photos: [], length_options: [], size_options: [], addons: [] };
  if(mobile)Object.assign(salon,{service_location_type:'mobile',offers_mobile:true,travel_radius_miles:10,travel_fee_cents:1500,address_street:null,address_zip:null});
  if(priced) Object.assign(style,{base_price:100,price_display_min:100,price_display_max:100});
  if(assignments&&(table==='styles'||table==='stylists')) {
    const second=revisionId(businessId,401);
    const rows=table==='styles'?[{...style,name:'Fixture braids'},{...style,id:second,name:'Fixture silk press'}]:[
      {id:revisionId(businessId,101),salon_id:businessId,name:'Braids professional',is_active:true,is_draft:false,assigned_service_ids:[businessId]},
      {id:revisionId(businessId,102),salon_id:businessId,name:'Silk professional',is_active:true,is_draft:false,assigned_service_ids:[second]},
      {id:revisionId(businessId,103),salon_id:businessId,name:'Unassigned professional',is_active:true,is_draft:false,assigned_service_ids:[]},
    ];
    json(response,200,rows,{'content-range':`0-${rows.length-1}/${rows.length}`});return true;
  }
  const rule={id:businessId,salon_id:businessId,rate:depositRate,threshold_amount:null,threshold_rate:null,repeat_incident_count:null,repeat_incident_rate:null,incident_window_days:365};
  const row = table === 'salons' ? salon : table === 'styles' ? style : table === 'business_policy_revisions' ? revision : table==='business_deposit_rules'&&priced ? rule : null;
  const single = String(request.headers.accept || '').includes('application/vnd.pgrst.object+json');
  json(response, 200, single ? row : row ? [row] : [], { 'content-range': row ? '0-0/1' : '0-0/0' });
  return true;
}

export const revisionId = (id, version) => id.slice(0, -4) + String(version).padStart(4, '0');
