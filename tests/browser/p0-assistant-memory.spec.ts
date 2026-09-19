import {expect, type Page} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';

test.use({serviceWorkers:'block'});
test('P0 Assistant memory failure shows its exact protected reference without provider details',async({page})=>{
  await p0OwnerFixture(page,{populated:true,locale:'en'});
  await page.route('**/api/salon/assistant/memory',route=>route.fulfill({status:503,headers:{'X-Request-ID':'MEMORY-FIXTURE-REFERENCE'},json:{code:'ASSISTANT_MEMORY_UNAVAILABLE',request_id:'MEMORY-FIXTURE-REFERENCE',error:'private-provider-detail-must-not-render'}}));
  await page.goto('/salon/dashboard');
  await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  await dialog.getByText('Conversation options',{exact:true}).click();
  await dialog.getByRole('button',{name:'Saved conversation context',exact:true}).click();
  await expect(dialog.getByText('Saved context could not be loaded or changed. Your current conversation is still available.',{exact:true})).toBeVisible();
  await expect(dialog.getByText('MEMORY-FIXTURE-REFERENCE',{exact:true})).toBeVisible();
  await expect(dialog).not.toContainText('private-provider-detail-must-not-render');
});
for (const [width,height] of [[390,844],[768,900],[1440,900],[844,390]]) {
  test(`P0 Assistant memory survives refresh and another session at ${width}x${height}`,async({page,browser})=>{
    test.setTimeout(90000);
    let memory: {request_ids:string[];locale:string;expires_at:string}|null=null;
    const writes:Record<string,unknown>[]=[];
    const questions:Record<string,unknown>[]=[];
    const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    async function configure(target:Page) {
      await p0OwnerFixture(target,{populated:true,locale:'en'});
      await target.setViewportSize({width,height});
      await target.route('**/api/salon/assistant/memory',async route=>{
        expect(route.request().headers().authorization).toMatch(/^Bearer /);
        if(route.request().method()==='POST') {
          const body=route.request().postDataJSON(); writes.push(body);
          expect(body).toEqual({consent:true,locale:'es',request_ids:[id]});
          memory={request_ids:body.request_ids,locale:body.locale,expires_at:new Date(Date.now()+30*86400000).toISOString()};
        } else if(route.request().method()==='DELETE') memory=null;
        await route.fulfill({json:{memory}});
      });
      await target.route('**/api/salon/assistant',route=>{
        questions.push(route.request().postDataJSON());
        return route.fulfill({json:{response_locale:'es',assistant_message:'Silk Press cuesta 120 USD.',request:{id,tool:'get_services_and_prices',risk_class:1,arguments:{query:'Silk Press'},result:{services:[],total:0},execution_payload:{},before_summary:{},digest:'a'.repeat(64),confirmed_at:null}}});
      });
      await target.goto('/salon/dashboard');
      await target.getByRole('button',{name:'GC Assistant',exact:true}).click();
      return target.getByRole('dialog',{name:'GC Assistant',exact:true});
    }
    let dialog=await configure(page);
    await dialog.locator('textarea').fill('Please use Spanish. Silk Press? Do not remember private-person@example.test.');
    await dialog.getByRole('button',{name:'Ask GC Assistant',exact:true}).click();
    await expect(dialog.locator('article').last()).toContainText('Silk Press cuesta 120 USD.');
    expect(writes).toEqual([]);
    await dialog.getByText('Conversation options',{exact:true}).click();
  await dialog.getByRole('button',{name:'Saved conversation context',exact:true}).click();
    await expect(dialog.getByText('No saved context is available.',{exact:true})).toBeVisible();
    await dialog.getByRole('button',{name:'Save this context for 30 days',exact:true}).click();
    await expect(dialog.getByText('Context saved for 30 days. Only you can resume it in this business.',{exact:true})).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes)).not.toContain('private-person');
    await page.reload();
    await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
    dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
    await expect(dialog.locator('article')).toHaveCount(0);
    await dialog.getByText('Conversation options',{exact:true}).click();
  await dialog.getByRole('button',{name:'Saved conversation context',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'Resume saved context',exact:true})).toBeEnabled();
    await dialog.getByRole('button',{name:'Resume saved context',exact:true}).click();
    await expect(dialog.getByText('Saved context resumed. Ask a new question to read current information.',{exact:true})).toBeVisible();
    await dialog.locator('textarea').fill('And the price now?');
    await dialog.getByRole('button',{name:'Ask GC Assistant',exact:true}).click();
    await expect(dialog.locator('article')).toHaveCount(1);
    expect(questions.at(-1)).toMatchObject({locale:'es',previous_request_ids:[id],conversation:[]});
    const secondContext=await browser.newContext({serviceWorkers:'block',baseURL:new URL(page.url()).origin});
    try {
      const second=await secondContext.newPage();
      const next=await configure(second);
      await next.getByText('Conversation options',{exact:true}).click();
      await next.getByRole('button',{name:'Saved conversation context',exact:true}).click();
      await expect(next.getByRole('button',{name:'Resume saved context',exact:true})).toBeEnabled();
      await next.getByRole('button',{name:'Delete saved context',exact:true}).click();
      await expect(next.getByText('Saved context deleted. Business audit records are unchanged.',{exact:true})).toBeVisible();
      // The first tab must reread at resume, not reuse its stale cached bookmark.
      await dialog.getByRole('button',{name:'Resume saved context',exact:true}).click();
      await expect(dialog.getByText('No saved context is available.',{exact:true})).toBeVisible();
      await expect(dialog.getByRole('button',{name:'Resume saved context',exact:true})).toBeDisabled();
      expect(memory).toBeNull();
    } finally {await secondContext.close();}
  });
}
