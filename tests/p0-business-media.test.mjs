import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = typescriptLoader(process.cwd());
const { defaultPhotoDetails, validatePhotoDetails, publicGalleryPhotos } = load('src/lib/businessPhotoMetadata.ts');
const { profilePatchPermissions, validateBusinessTrustInfo } = load('src/lib/businessProfileFields.ts');

test('photo metadata preserves original multilingual prose and rejects authority or invalid fields', () => {
  const details = { ...defaultPhotoDetails('services', 'fr'), title: 'Tresses — 120 USD', caption: 'Préparation 15 min. 请勿拉扯。' };
  assert.equal(JSON.stringify(validatePhotoDetails(details)), JSON.stringify(details));
  for (const patch of [{ salon_id: 'business-b' }, { category: 'invented' }, { title: 'x'.repeat(121) }, { featured: 'true' }]) assert.throws(() => validatePhotoDetails({ ...details, ...patch }), /PHOTO_INVALID/);
  assert.equal(JSON.stringify(publicGalleryPhotos(['a','b','a',null])), JSON.stringify(['a','b']));
});

test('mixed profile patches require every affected permission and walk-in status stays a profile preference', () => {
  assert.equal(JSON.stringify(profilePatchPermissions(['hours','description','gallery_photos','notification_preferences'])), JSON.stringify(['availability','my_page','photos','settings']));
  assert.equal(JSON.stringify(profilePatchPermissions(['logo_url'])), JSON.stringify(['photos']));
  const info = validateBusinessTrustInfo({ walk_ins_welcome: true, appointment_only: false });
  assert.equal(info.walk_ins_welcome, true);
  assert.throws(() => validateBusinessTrustInfo({ walk_ins_welcome: true, appointment_only: true }), /either/);
  assert.throws(() => validateBusinessTrustInfo({ walk_ins_welcome: 'true' }), /checkbox/);
  assert.equal(Object.hasOwn(info, 'booking_settings'), false);
});

function fixture(options = {}) {
  const calls = []; let metadata = {};
  const context = { user: { id: 'actor-a' }, salon: { id: 'business-a', gallery_photos: ['https://local.test/a'] }, admin: {
    async rpc(name,args) { calls.push({ name,args }); assert.equal(name, 'update_business_photo_details'); assert.equal(args.p_salon, 'business-a'); assert.equal(args.p_user, 'actor-a');
      if (options.stale) return { error: { message: 'PHOTO_STALE' } };
      metadata = { ...metadata, [args.p_url]: args.p_details }; return { data: metadata };
    },
  } };
  const route = typescriptLoader(process.cwd(), {
    '@/lib/supabaseAdmin': { requireSalonPermission: async (_request,permission) => { assert.equal(permission,'photos'); if (options.denied) throw Error('Forbidden'); return context; } },
    '@/lib/requestSecurity': { enforceRateLimit() {} },
    '@/lib/contentModerationServer': { moderatePublicContent: async (_admin,prose) => { calls.push({ prose }); return { allowed: options.moderated !== false }; } },
    '@/lib/platformErrors': { capturePlatformError: async () => 'PHOTO-EXACT-REFERENCE' },
    '@/lib/operationalMonitoring': { routeMonitoringProfile() {}, withOperationalMonitoring: (_profile,fn) => fn },
  })('src/app/api/salon/photos/route.ts');
  return { calls, save: body => route.PATCH(new Request('http://localhost/api/salon/photos', { method: 'PATCH', body: JSON.stringify(body) })) };
}
const input = () => ({ url: 'https://local.test/a', details: defaultPhotoDetails('team'), expected_details: null });

test('photo detail saves use an authorized saved image and reject another business before moderation or mutation', async () => {
  const f = fixture(); const response = await f.save(input());
  assert.equal(response.status, 200); assert.equal((await response.json()).verified,true);
  for (const bad of [{ ...input(), url: 'https://local.test/business-b' }, { ...input(), salon_id:'business-b' }]) {
    const other = fixture(); const rejected = await other.save(bad);
    assert.ok([400,404].includes(rejected.status)); assert.equal(other.calls.length,0);
  }
  const denied = fixture({ denied:true }); assert.equal((await denied.save(input())).status,403); assert.equal(denied.calls.length,0);
});

test('conflicting photo edits preserve HTTP409 and exact support reference; moderation cannot be bypassed', async () => {
  const response = await fixture({ stale:true }).save(input());
  assert.equal(response.status,409); assert.equal(response.headers.get('X-Request-ID'),'PHOTO-EXACT-REFERENCE');
  assert.equal((await response.json()).code,'PHOTO_STALE');
  const blocked=fixture({ moderated:false }); assert.equal((await blocked.save(input())).status,400);
  assert.equal(blocked.calls.some(call => call.name),false);
});
