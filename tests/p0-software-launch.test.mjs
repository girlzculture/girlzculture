import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server.js';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {proxy}=load('src/proxy.ts');
const {publicNavigationGroups}=load('src/lib/publicNavigation.ts');
const req=(path,options={})=>new NextRequest('https://girlzculture.test'+path,{...options,headers:{host:'girlzculture.test',...options.headers}});

test('software launch closes discovery independently of direct real-business booking and authenticated work',()=>{
 const old=process.env.CUSTOMER_MARKETPLACE_LIVE;process.env.CUSTOMER_MARKETPLACE_LIVE='false';
 try{
  for(const path of ['/','/salons','/styles','/featured','/search','/trending','/social']){
   const result=proxy(req(path,{headers:{'x-gc-site-access':'1'}}));
   assert.equal(result.headers.get('x-middleware-rewrite'),'https://girlzculture.test/prelaunch',path);
   assert.equal(result.headers.get('x-middleware-request-x-gc-site-access'),null);
  }
  for(const path of ['/api/discovery/salons','/api/search/suggestions','/api/concierge/search']){
   const response=proxy(req(path,{headers:{'x-gc-site-access':'1'}}));assert.equal(response.status,503,path);
   assert.match(response.headers.get('content-type'),/application\/json/);
  }
  for(const path of ['/salon/real-business','/salon/real-business/book','/salon/real-business/policies','/api/booking-availability','/api/stripe/booking-checkout','/api/salons/real-business/qr','/business/signup','/business/waitlist','/salon/dashboard','/account','/admin/login'])assert.equal(proxy(req(path)).headers.get('x-middleware-next'),'1',path);
 }finally{if(old===undefined)delete process.env.CUSTOMER_MARKETPLACE_LIVE;else process.env.CUSTOMER_MARKETPLACE_LIVE=old;}
});

test('unlisted founder entry retains a browsing session across navigation without becoming an auth role',()=>{
 const old=process.env.CUSTOMER_MARKETPLACE_LIVE;delete process.env.CUSTOMER_MARKETPLACE_LIVE;
 try{
  const entry=proxy(req('/site-access'));assert.match(entry.headers.get('set-cookie')||'',/gc_site_access=marketplace-demo/);
  for(const path of ['/site-access','/styles','/salons','/api/discovery/salons','/about','/site-access/business-demo']){
   const r=proxy(req(path,{headers:{cookie:'gc_site_access=marketplace-demo'}}));
   assert.equal(r.headers.get('x-middleware-next'),'1');assert.equal(r.headers.get('x-middleware-request-x-gc-site-access'),'1');
   assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(r.headers.get('netlify-cdn-cache-control'),/no-store/);
  }
  const root=proxy(req('/',{headers:{cookie:'gc_site_access=marketplace-demo'}}));assert.match(root.headers.get('x-middleware-rewrite'),/\/prelaunch$/);
 }finally{if(old===undefined)delete process.env.CUSTOMER_MARKETPLACE_LIVE;else process.env.CUSTOMER_MARKETPLACE_LIVE=old;}
});

test('normal public navigation never advertises the founder entrance or closed discovery',()=>{
 const cms=[{item_key:'home',label:'Home',href:'/'},{item_key:'demo',label:'Demo',href:'/site-access'},{item_key:'salons',label:'Salons',href:'/salons'},{item_key:'about',label:'Our story',href:'/about'},{item_key:'pricing',label:'Pricing',href:'/plans'}];
 const normal=publicNavigationGroups(cms,false).flatMap(group=>group.links);
 assert.ok(normal.some(link=>link.href==='/blog'));assert.ok(normal.some(link=>link.href==='/about'));
 assert.ok(normal.some(link=>link.href==='/business/signup'));assert.ok(normal.some(link=>link.href==='/plans'));
 assert.ok(!normal.some(link=>['/site-access','/salons','/styles'].includes(link.href)));
 const demonstration=publicNavigationGroups(cms,true).flatMap(group=>group.links);
 assert.ok(!demonstration.some(link=>link.href==='/site-access'));assert.ok(demonstration.some(link=>link.href==='/salons'));
});
