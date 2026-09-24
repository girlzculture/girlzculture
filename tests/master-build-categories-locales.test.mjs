import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_BUSINESS_CATEGORIES, waitlistCategory, categoryOpeningMessage } from '../src/lib/businessCategories.ts';
import { SUPPORTED_LOCALES, interfaceLocale, normalizeLocale } from '../src/i18n/catalog.ts';
import { businessLabels } from '../src/lib/businessLabels.ts';
import { MASTER_BUILD_COPY } from '../src/i18n/master-build-source-catalog.ts';
test('only hair onboarding and six named waitlists are offered',()=>{
 assert.equal(ACTIVE_BUSINESS_CATEGORIES.length,7);
 assert.equal(ACTIVE_BUSINESS_CATEGORIES.filter(c=>c.live).length,1);
 assert.equal(ACTIVE_BUSINESS_CATEGORIES.some(c=>c.slug==='other'),false);
 assert.equal(waitlistCategory('other'),undefined);
 assert.equal(waitlistCategory('hair-salon-braiding'),undefined);
 for(const category of ACTIVE_BUSINESS_CATEGORIES.filter(c=>!c.live)) assert.equal(waitlistCategory(category.slug),category);
});
test('coming-soon message names category without promising a date',()=>{
 assert.equal(categoryOpeningMessage('Nail Studio'),"We're opening access to more beauty and wellness businesses in your area soon. Join the waitlist and we'll reach out when onboarding opens for Nail Studio businesses in your area.");
});
test('four interface languages exclude deferred Wolof without rewriting historical locale',()=>{
 assert.deepEqual(SUPPORTED_LOCALES,['en','es','fr','zh-CN']);
 assert.equal(interfaceLocale('wo'),'en');
 assert.equal(normalizeLocale('wo'),'wo');
 for(const locale of SUPPORTED_LOCALES)assert.equal(interfaceLocale(locale),locale);
});

test('category team and service labels are translated while solo team controls stay hidden',()=>{
 for(const [category,team] of [['Hair Salon','Stylists'],['Nail Studio','Technicians'],['Massage & Wellness','Therapists'],['Aesthetics Clinic','Practitioners'],['Tattoo Studio','Artists'],['Lash & Brow Bar','Technicians'],['Barbershop','Barbers']]){
  const labels=businessLabels(category);
  assert.equal(labels.team,team);assert.equal(businessLabels(category,true).team,null);
  assert.equal(labels.services,category==='Aesthetics Clinic'?'Treatments & Pricing':'Services & Pricing');
  for(const label of [labels.services,...(team==='Stylists'?[]:[team])]){
   const translations=MASTER_BUILD_COPY.find(row=>row[0]===label);
   assert.ok(translations);for(const translation of translations.slice(1))assert.ok(translation&&translation!==label);
  }
 }
});

// Load the same navigation module used by both desktop and mobile chrome.
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL('../src/lib/publicNavigation.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const navigation={exports:{}};
new Function('require','module','exports',output)(name=>name==='./businessCategories'?{ACTIVE_BUSINESS_CATEGORIES}:require(name),navigation,navigation.exports);
test('curated navigation keeps every category and one business application destination',()=>{
 for(const available of [true,false]){
  const groups=navigation.exports.publicNavigationGroups([],available);
  assert.deepEqual(groups[1].links.map(link=>[link.label,link.href]),[['Why Girlz Culture','/business'],['Pricing & Plans','/plans'],['Apply to Join','/business/signup'],['Help Center','/help']]);
  assert.equal(groups[1].links.filter(link=>link.href==='/business/signup').length,1);
  assert.equal(groups[0].links.filter(link=>link.href.startsWith('/categories/')).length,6);
  assert.equal(groups[0].links.some(link=>link.label==='Other'),false);
  assert.equal(groups[0].links.some(link=>link.label==='Browse Services'),available);
  for(const link of groups[1].links){const row=MASTER_BUILD_COPY.find(row=>row[0]===link.label);assert.equal(row.length,4);}
 }
});

const metricsSource=fs.readFileSync(new URL('../src/lib/ownerBusinessMetrics.ts',import.meta.url),'utf8');
const metrics={exports:{}};
new Function('module','exports',ts.transpileModule(metricsSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(metrics,metrics.exports);
test('Solo profile completion does not require a team while team plans do',()=>{
 const business={name:'A real Salon name',description:'Original',phone:'2125550100',address_street:'Address',cover_photo_url:'/photo.png',subscription_tier:'Solo Pro'};
 assert.equal(metrics.exports.profileCompletion(business,1,0),100);
 assert.equal(metrics.exports.profileCompletion({...business,subscription_tier:'Starter'},1,0),86);
 assert.equal(metrics.exports.profileCompletion({...business,subscription_tier:'Starter'},1,1),100);
 assert.equal(business.name,'A real Salon name');
});
