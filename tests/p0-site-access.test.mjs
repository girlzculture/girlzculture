import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server.js';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = typescriptLoader(fileURLToPath(new URL('../', import.meta.url)), { 'server-only': {} }, { Headers });
const { proxy } = load('src/proxy.ts');
const { publicNavigationGroups } = load('src/lib/publicNavigation.ts');
const openAi = load('src/lib/openAiServer.ts');

test('root preserves business onboarding while marketplace and deep links work without a launch flag', () => {
  const previous = process.env.CUSTOMER_MARKETPLACE_LIVE;
  try {
    for (const value of ['', 'false', 'true']) {
      process.env.CUSTOMER_MARKETPLACE_LIVE = value;
      for (const path of ['/', '/site-access', '/styles', '/salons', '/salon/example/book', '/api/stripe/booking-checkout', '/business/login', '/admin/login']) {
        const result = proxy(new NextRequest('https://girlzculture.test'+path, { headers: { host:'girlzculture.test', cookie:'gc_site_access=marketplace-demo', 'x-gc-site-access':'1' } }));
        if(path === '/') assert.equal(new URL(result.headers.get('x-middleware-rewrite')).pathname,'/prelaunch');
        else assert.equal(result.headers.get('x-middleware-next'),'1',path);
        assert.equal(result.headers.get('location'),null,path);
        assert.match(result.headers.get('set-cookie'),/gc_site_access=;/);
        assert.ok(!result.headers.get('x-middleware-override-headers')?.includes('x-gc-site-access'));
      }
    }
  } finally { if(previous === undefined) delete process.env.CUSTOMER_MARKETPLACE_LIVE; else process.env.CUSTOMER_MARKETPLACE_LIVE=previous; }
});

test('legacy exit never closes the marketplace and rejects cross-origin cookie mutation', () => {
  for(const method of ['GET','HEAD']) {
    const r=proxy(new NextRequest('https://girlzculture.test/site-access/exit',{method,headers:{host:'girlzculture.test'}}));
    assert.equal(r.status,204);assert.equal(r.headers.get('set-cookie'),null);
  }
  for(const origin of ['https://elsewhere.test','']) {
    const r=proxy(new NextRequest('https://girlzculture.test/site-access/exit',{method:'POST',headers:{origin,host:'girlzculture.test'}}));
    assert.equal(r.status,403);assert.equal(r.headers.get('set-cookie'),null);
  }
  const r=proxy(new NextRequest('https://girlzculture.test/site-access/exit',{method:'POST',headers:{origin:'https://girlzculture.test',host:'girlzculture.test'}}));
  assert.equal(r.status,303);assert.equal(new URL(r.headers.get('location')).pathname,'/site-access');
});

test('published CMS links survive grouping; subscription pricing only appears under For Businesses', () => {
  const groups=publicNavigationGroups([
    {item_key:'home',label:'Home',href:'/'}, {item_key:'styles',label:'Styles',href:'/styles'},
    {item_key:'price',label:'Old pricing link',href:'/pricing'}, {item_key:'plans',label:'Plans',href:'/plans'},
    {item_key:'about',label:'Our story',href:'/about'}, {item_key:'how',label:'How It Works',href:'/how-it-works'},
    {item_key:'login',label:'Business login',href:'/business/login'}
  ]);
  assert.deepEqual(Array.from(groups,g=>g.label),['Explore','For Businesses']);
  assert.ok(groups[0].links.some(i=>i.href==='/site-access'));
  assert.ok(groups[0].links.some(i=>i.href==='/about' && i.label==='Our story'));
  assert.ok(groups[0].links.some(i=>i.href==='/salons'));
  assert.equal(groups[0].links.filter(i=>i.href==='/plans'||i.href==='/pricing').length,0);
  assert.equal(groups[1].links.filter(i=>i.href==='/plans').length,1);
  assert.equal(groups[1].links.filter(i=>i.href==='/business/login').length,1);
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

test('customer homepage removes business-category waitlists but preserves appointment waitlists and other CMS content',()=>{
  const {customerDiscoverySections,isFutureBusinessWaitlist}=load('src/lib/customerDiscoveryContent.ts');
  const sections=[{id:'business-categories',type:'card_grid',cards:[{href:'/business/waitlist?category=nails',title:'Nails'}]},{id:'appointments',cta_href:'/salon/current/waitlist',body:'Join the appointment waitlist'},{id:'mixed',cards:[{href:'https://girlzculture.com/business/waitlist?category=massage'},{href:'/salons',title:'Browse hair salons'}]},{id:'text',title:'How it works',body:'Preserve this published content'}];
  const result=customerDiscoverySections(sections);
  assert.deepEqual(Array.from(result,s=>s.id),['appointments','mixed','text']);
  assert.equal(result[1].cards.length,1);assert.equal(result[1].cards[0].href,'/salons');
  assert.equal(sections[2].cards.length,2,'filter must not mutate published CMS input');
  assert.equal(isFutureBusinessWaitlist('/business/signup'),false);
  assert.equal(isFutureBusinessWaitlist('/salon/current/waitlist'),false);
});
