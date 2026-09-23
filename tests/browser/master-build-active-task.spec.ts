import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
test.use({serviceWorkers:'block'});
for(const [width,height]of [[390,844],[768,900],[1440,900],[844,390]]){
 test(`Master active task preserves original details, resume and explicit topic change at ${width}x${height}`,async({page})=>{
  await p0OwnerFixture(page,{populated:true,locale:'en'});await page.setViewportSize({width,height});
  const original='Create a walk-in for Alma Aba, Thursday September 24, 3:30 PM, any stylist, any service';
  const task={id:'33000000-0000-4000-8000-000000000002',tool:'prepare_manual_appointment',revision:1,label:original};
  let active:typeof task|null=null,failed=false;const sent:Record<string,unknown>[]=[],ended:Record<string,unknown>[]=[];
  await page.route('**/api/salon/assistant/task',async route=>{
   if(route.request().method()==='DELETE'){ended.push(route.request().postDataJSON());active=null;return route.fulfill({json:{active_task:null,verified:true}});}
   return route.fulfill({json:{active_task:active}});
  });
  await page.route('**/api/salon/assistant',async route=>{
   const body=route.request().postDataJSON();sent.push(body);expect(body.task_tracking).toBe(true);
   if(body.text==='Show my finances'){
    if(active)return route.fulfill({json:{task_switch_required:true,active_task:active}});
    if(!failed){failed=true;return route.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'TASK-CONTINUE-FAILURE'}});}
    return route.fulfill({json:{reply:'Your business has no unpaid manual receipts.',active_task:null,response_locale:'en'}});
   }
   active=task;return route.fulfill({json:{clarification:'Keep exactly 3:30 PM for Alma Aba.',active_task:active,response_locale:'en'}});
  });
  await page.goto('/salon/dashboard');
  const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!(await dialog.isVisible()))await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};
  await open();const composer=dialog.locator('textarea');
  for(let n=0;n<14;n++){
   await composer.fill(n?`Keep the original time, follow-up ${n}`:original);await composer.press('Enter');
   await expect(dialog.locator('article')).toHaveCount(n+1);
   await expect(dialog.locator('article').last()).toContainText('Keep exactly 3:30 PM for Alma Aba.');
  }
  await expect(dialog.locator('article').first()).toContainText(original);
  await page.reload();await open();await expect(dialog.getByRole('region',{name:'Unfinished task'})).toContainText(original);
  await composer.fill('Show my finances');await composer.press('Enter');
  await expect(dialog.getByRole('button',{name:'Keep current task',exact:true})).toBeVisible();
  expect(ended).toHaveLength(0);expect(sent.filter(b=>b.text==='Show my finances')).toHaveLength(1);
  await dialog.getByRole('button',{name:'Keep current task',exact:true}).click();
  await expect(dialog.getByRole('region',{name:'Unfinished task'})).toContainText(original);
  await composer.fill('Show my finances');await composer.press('Enter');
  await dialog.getByRole('button',{name:'End task and continue',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Retry message',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Retry message',exact:true}).click();
  await expect(dialog.locator('article').last()).toContainText('Your business has no unpaid manual receipts.');
  await expect(dialog.locator('article')).toHaveCount(2);
  await expect(dialog.getByRole('region',{name:'Unfinished task'})).toHaveCount(0);
  expect(ended).toEqual([{id:task.id,revision:1,confirm:true}]);
  const changed=sent.filter(b=>b.text==='Show my finances');expect(changed).toHaveLength(4);
  expect(changed[2].request_id).toBe(changed[1].request_id);expect(changed[3].request_id).toBe(changed[1].request_id);
  expect(changed[3].conversation).toEqual([]);expect(changed[3].previous_request_ids).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
