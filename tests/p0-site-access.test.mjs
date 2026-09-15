import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const load = typescriptLoader(fileURLToPath(new URL('../', import.meta.url)), {
  'server-only': {},
});
const access = load('src/lib/marketplaceLaunchCore.ts');
const openAi = load('src/lib/openAiServer.ts');

test('site access has one unlisted entry and a session-scoped cookie contract', () => {
  assert.equal(access.SITE_ACCESS_ENTRY_PATH, '/site-access');
  assert.equal(access.SITE_ACCESS_EXIT_PATH, '/site-access/exit');
  assert.equal(access.SITE_ACCESS_COOKIE, 'gc_site_access');
  assert.equal(access.SITE_ACCESS_COOKIE_VALUE, 'marketplace-demo');
});

test('site access admits marketplace presentation pages and rejects transaction pages', () => {
  for (const path of [
    '/',
    '/salons',
    '/search',
    '/styles',
    '/featured',
    '/trending',
    '/social',
    '/salon/demo-salon',
    '/salon/demo-salon/stylist/demo-stylist',
    '/salon/demo-salon/product/demo-product',
  ]) assert.equal(access.isSiteAccessMarketplacePage(path), true, path);

  for (const path of [
    '/salon/demo-salon/book',
    '/salon/demo-salon/checkout',
    '/salon/demo-salon/reserve/demo-product',
    '/booking/manage',
    '/pickup/manage',
    '/salon/dashboard',
    '/salon/login',
  ]) assert.equal(access.isSiteAccessMarketplacePage(path), false, path);
});

test('site access exit distinguishes speculative requests from deliberate navigation', () => {
  for (const headers of [
    { 'next-router-prefetch': '1' },
    { purpose: 'prefetch' },
    { 'sec-purpose': 'prefetch;prerender' },
  ]) assert.equal(access.isSiteAccessPrefetch(new Headers(headers)), true);
  assert.equal(access.isSiteAccessPrefetch(new Headers()), false);
  assert.equal(access.isSiteAccessPrefetch(new Headers({ 'sec-fetch-mode': 'navigate' })), false);
});

test('site access API allowlist contains searches only', () => {
  for (const path of [
    '/api/discovery',
    '/api/discovery/suggestions',
    '/api/search',
    '/api/salons/demo-salon',
  ]) {
    assert.equal(access.isSiteAccessMarketplaceApi(path, 'GET'), true, path);
    assert.equal(access.isSiteAccessMarketplaceApi(path, 'HEAD'), true, path);
  }
  for (const path of [
    '/api/discovery/decision-search',
    '/api/discovery/availability',
    '/api/concierge/search',
  ]) assert.equal(access.isSiteAccessMarketplaceApi(path, 'POST'), true, path);
  for (const path of [
    '/api/stripe/booking-checkout',
    '/api/stripe/commerce-checkout',
    '/api/stripe/pickup-reservation',
    '/api/guest/bookings',
    '/api/pickup/reservation',
    '/api/promo/validate',
  ]) {
    assert.equal(access.isSiteAccessMarketplaceApi(path, 'POST'), false, path);
    assert.equal(access.isSiteAccessMarketplaceApi(path, 'GET'), false, path);
  }
});

test('OpenAI REST URLs support Netlify AI Gateway without duplicating v1', () => {
  const previous = process.env.OPENAI_BASE_URL;
  try {
    process.env.OPENAI_BASE_URL = 'https://gateway.example.test/team/site';
    assert.equal(openAi.openAiApiUrl('chat/completions'), 'https://gateway.example.test/team/site/v1/chat/completions');
    process.env.OPENAI_BASE_URL = 'https://gateway.example.test/team/site/v1/';
    assert.equal(openAi.openAiApiUrl('/models'), 'https://gateway.example.test/team/site/v1/models');
    process.env.OPENAI_BASE_URL = 'http://gateway.example.test';
    assert.throws(() => openAi.openAiApiUrl('chat/completions'), /OPENAI_BASE_URL_INVALID/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous;
  }
});
