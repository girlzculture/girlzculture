import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';

test.use({serviceWorkers:'block'});

for(const [locale,width,height,isNew] of [['en',390,844,true],['fr',768,900,false],['es',1440,1000,false],['zh-CN',844,390,false]] as const){
 test(`Business team editor keeps required fields first and upload targets usable in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale}),t=(source:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[source]||source;
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/stylists/'+(isNew?'new':f.ids.professional));
  const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:t('Stylist details'),exact:true})});
  const name=dialog.getByRole('textbox',{name:t('Name'),exact:true});await expect(name).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  const geometry=await name.evaluate(el=>{const r=el.getBoundingClientRect(),dialog=el.closest('[role="dialog"]')!,header=dialog.firstElementChild!.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,dialogScroll:dialog.scrollTop,headerBottom:header.bottom,viewport:innerHeight};});
  await info.attach('stylist-editor-initial-geometry',{body:JSON.stringify(geometry),contentType:'application/json'});
  await page.screenshot({path:info.outputPath(`stylist-editor-required-first-${locale}.png`)});
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  if(width<1024){expect(geometry.dialogScroll).toBe(0);expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom);expect(geometry.bottom).toBeLessThanOrEqual(Math.min(height,360));}
  // The input and its upload target share the existing uploader root. Measure
  // against that root, so the desktop regression catches viewport-driven
  // three-column thumbnails inside this already narrow editor column.
  const uploaders=dialog.locator('input[type="file"]');await expect(uploaders).toHaveCount(2);
  for(let index=0;index<2;index++){
   const input=uploaders.nth(index),root=input.locator('..'),target=root.locator(':scope > .grid > div > button').last();
   await target.scrollIntoViewIfNeeded();const m=await target.evaluate(el=>{const r=el.getBoundingClientRect(),root=el.parentElement!.parentElement!.parentElement!.getBoundingClientRect();return{width:r.width,height:r.height,available:root.width};});
   expect(m.width,JSON.stringify(m)).toBeGreaterThanOrEqual(m.available-20);expect(m.width).toBeGreaterThanOrEqual(120);expect(m.height).toBeGreaterThanOrEqual(44);
   if(isNew)await expect(input).toBeDisabled();else await expect(input).toBeEnabled();
  }
  const draft=`Retained ${locale} stylist`,bio=dialog.getByRole('textbox',{name:t('Bio / Description')});
  await name.fill(draft);await bio.fill('Original biography — $120 remains unchanged');await dialog.getByLabel(t('Years of Experience'),{exact:true}).fill('7');
  await expect(name).toHaveValue(draft);await expect(bio).toHaveValue('Original biography — $120 remains unchanged');expect(f.actions).toEqual([]);
  const save=dialog.getByRole('button',{name:t('Save Stylist'),exact:true});expect(await save.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);await save.click();
  await expect.poll(()=>f.actions.filter(action=>action.table==='stylists').length).toBe(1);
  await expect(page).toHaveURL(/\/stylists\/[0-9a-f-]{36}(?:\?|$)/);await page.reload();await expect(name).toHaveValue(draft);await expect(bio).toHaveValue('Original biography — $120 remains unchanged');
  const saved=f.records.stylists.find(row=>row.name===draft);expect(saved).toMatchObject({bio:'Original biography — $120 remains unchanged',years_experience:7,photos:[]});
  expect(f.actions).toHaveLength(1);expect(f.unexpected).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}

for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business team preserves identities, full specialties, selection and schedule navigation in ${locale}`,async({page},info)=>{
  await page.clock.setFixedTime(new Date('2026-09-18T14:00:00Z'));
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(s:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[s]||s;
  Object.assign(f.records.stylists[0],{name:'Awa',bio:'Original Awa biography',specialties:['Box Braids','Boho / Goddess Braids','Loc Retwist','Scalp Care','Protective Styles','Silk Press']});
  const second='33000000-0000-4000-8000-000000000099';
  f.records.stylists.push({...f.records.stylists[0],id:second,name:'Marie',bio:'Original Marie biography',specialties:['Color'],availability:{Mon:{open:'10:00',close:'16:00'}}});
  f.records.bookings.push({...f.records.bookings[0],id:'complete',status:'Completed',estimated_total:123.45,appointment_datetime:'2026-09-17T14:00:00Z'});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/stylists');
  await expect(page.getByRole('navigation',{name:t('Team workspace'),exact:true})).toBeVisible();
  const awa=page.getByRole('article',{name:'Awa',exact:true});
  if(width===390)await expect(awa).toBeInViewport();await expect(awa.getByText('Silk Press',{exact:true})).toBeVisible();
  await awa.getByRole('button',{name:t('View professional'),exact:true}).click();
  const detail=page.getByRole('complementary',{name:t('Selected professional'),exact:true});
  await expect(detail.getByText('Original Awa biography',{exact:true})).toBeVisible();
  await page.reload();await expect(detail.getByText('Original Awa biography',{exact:true})).toBeVisible();
  await page.getByRole('article',{name:'Marie',exact:true}).getByRole('button',{name:t('View professional'),exact:true}).click();
  await expect(detail.getByText('Original Marie biography',{exact:true})).toBeVisible();await expect(detail).not.toContainText('Original Awa biography');
  await detail.getByRole('link',{name:t('Edit working hours'),exact:true}).click();
  await expect(page.getByRole('combobox',{name:t('Professional'),exact:true})).toHaveValue(second);
  await page.goBack();await expect(detail).toContainText('Original Marie biography');
  const nav=page.getByRole('navigation',{name:t('Team workspace'),exact:true});
  const choose=async(value:string,label:string)=>{if(width<640)await nav.getByRole('combobox',{name:t('Team view'),exact:true}).selectOption(value);else await nav.getByRole('button',{name:t(label),exact:true}).click();};
  await choose('performance','Performance');
  await expect(page.getByRole('region',{name:t('Team performance'),exact:true})).toContainText('123');
  await choose('onboarding','Onboarding');
  await expect(page.getByRole('region',{name:t('Team onboarding'),exact:true})).toContainText(t('Profile readiness uses saved information. It does not certify training or create a staff login.'));
  await choose('members','Team Members');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath('team-viewport.png')});
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}

test('Business team low-height workspace keeps the selected professional visible',async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true,locale:'zh-CN'}),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES['zh-CN']?.[s]||s;
 Object.assign(f.records.stylists[0],{name:'Landscape professional',bio:'Retained professional biography',specialties:['Silk Press']});
 await page.setViewportSize({width:844,height:390});await page.goto('/salon/dashboard/stylists?person='+f.ids.professional);
 const detail=page.getByRole('complementary',{name:t('Selected professional'),exact:true}),name=detail.getByRole('heading',{name:'Landscape professional',exact:true});await expect(name).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>window.scrollTo(0,0));const geometry=await name.evaluate(el=>{const r=el.getBoundingClientRect(),header=document.querySelector('.gc-owner-header')!.getBoundingClientRect(),nav=document.querySelector('[data-owner-mobile-navigation]')!.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,visible:Math.min(r.bottom,nav.top)-Math.max(r.top,header.bottom),scrollY:window.scrollY};});
 await info.attach('selected-professional-geometry',{body:JSON.stringify(geometry),contentType:'application/json'});await page.screenshot({path:info.outputPath('team-low-height-initial.png')});
 expect(geometry.scrollY).toBe(0);expect(geometry.visible,JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.height);
 for(const control of [page.getByRole('combobox',{name:t('Stylist status'),exact:true}),page.getByRole('combobox',{name:t('Stylist availability'),exact:true}),page.getByRole('textbox',{name:t('Search stylists'),exact:true}),detail.getByRole('button',{name:t('Close professional details'),exact:true})])expect(await control.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 await page.getByRole('textbox',{name:t('Search stylists'),exact:true}).fill('Landscape');await expect(page).toHaveURL(/q=Landscape/);await expect(name).toBeVisible();await expect(detail).toContainText('Retained professional biography');
 await page.getByRole('combobox',{name:t('Stylist status'),exact:true}).selectOption('inactive');await expect(name).toHaveCount(0);await page.getByRole('combobox',{name:t('Stylist status'),exact:true}).selectOption('all');await expect(name).toBeVisible();await expect(detail).toContainText('Silk Press');
 await expect(page.getByText(t('Total stylists'),{exact:true})).toBeVisible();await expect(detail.getByRole('link',{name:t('Edit profile'),exact:true})).toHaveAttribute('href',new RegExp('/stylists/'+f.ids.professional));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
});

for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business team availability selected labels fit their visible control in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale}),t=(source:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[source]||source;
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/stylists');await page.evaluate(()=>document.fonts.ready);
  const filter=page.getByRole('combobox',{name:t('Stylist availability'),exact:true});
  for(const value of ['all','set','missing']){
   await filter.selectOption(value);await expect(filter).toHaveValue(value);
   const metrics=await filter.evaluate(node=>{const select=node as HTMLSelectElement,style=getComputedStyle(select),canvas=document.createElement('canvas'),context=canvas.getContext('2d')!;context.font=style.font;const label=select.selectedOptions[0].textContent||'';return{label,textWidth:context.measureText(label).width,usableWidth:select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-20,height:select.getBoundingClientRect().height};});
   await info.attach(`availability-label-${value}`,{body:JSON.stringify(metrics),contentType:'application/json'});
   expect(metrics.textWidth,JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.usableWidth);expect(metrics.height).toBeGreaterThanOrEqual(44);
   if(value==='set')await expect(page.getByRole('article',{name:'Save',exact:true})).toBeVisible();
   if(value==='missing')await expect(page.getByText(t('No stylists match these filters.'),{exact:true})).toBeVisible();
  }
  await filter.selectOption('all');await expect(page.getByRole('article',{name:'Save',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath(`team-availability-label-${locale}.png`)});expect(f.unexpected).toEqual([]);expect(f.actions).toEqual([]);
 });
}
