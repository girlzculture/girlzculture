import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
test.use({serviceWorkers:'block'});
for(const width of [390,1440])test(`Public service assignments filter professional choices and reset a stale selection at ${width}px`,async({page,request})=>{
 const provider=process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL||'http://127.0.0.1:3105';expect(['localhost','127.0.0.1']).toContain(new URL(provider).hostname);
 const id=randomUUID(),professional=id.slice(0,-4)+'0101',second=id.slice(0,-4)+'0401';
 const seed=(version:number|null)=>request.post(`${provider}/__fixtures/p0-public-policy/${id}`,{headers:{'x-acceptance-fixture':'p0-public-policy'},data:{version,assignments:true}});
 expect((await seed(1)).ok()).toBe(true);
 const requests:{service:string|null;professional:string|null}[]=[];
 try{
  await page.setViewportSize({width,height:width===390?844:1000});
  await page.route('**/api/booking-availability?**',route=>{const u=new URL(route.request().url());requests.push({service:u.searchParams.get('style_id'),professional:u.searchParams.get('stylist_id')});return route.fulfill({json:{slots:[],timeZone:'America/New_York',reason:'No open times remain for this day.'}});});
  await page.goto(`/salon/p0-policy-${id}/book?stylist=${professional}`);
  if(width<1280)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
  await expect(page.getByRole('radio',{name:'Choose Braids professional',exact:true}).filter({visible:true})).toBeChecked();
  await expect(page.getByRole('radio',{name:'Choose Silk professional',exact:true})).toHaveCount(0);
  await expect(page.getByRole('radio',{name:'Choose Unassigned professional',exact:true})).toHaveCount(0);
  if(width<1280)await page.getByRole('button',{name:'1',exact:true}).click();
  await page.getByRole('combobox',{name:'Service',exact:true}).filter({visible:true}).selectOption(second);
  if(width<1280)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
  await expect(page.getByRole('radio',{name:'Choose Any available stylist',exact:true}).filter({visible:true})).toBeChecked();
  await expect(page.getByRole('radio',{name:'Choose Silk professional',exact:true}).filter({visible:true})).toBeVisible();
  await expect(page.getByRole('radio',{name:'Choose Braids professional',exact:true})).toHaveCount(0);
  await expect.poll(()=>requests.some(row=>row.service===second)).toBe(true);
  expect(requests.filter(row=>row.service===second).every(row=>row.professional===null)).toBe(true);
 }finally{expect((await seed(null)).ok()).toBe(true);}
});
