import { expect, test } from "@playwright/test";

for (const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1440,height:1000}]) {
  test(`subscription reporting does not infer old charges from the new catalog at ${viewport.width}x${viewport.height}`,async({page},testInfo)=>{
    await page.setViewportSize(viewport);
    await page.goto("/internal/acceptance/admin-workflows/subscriptions");
    const recorded=page.locator("article").filter({has:page.getByText("Recorded monthly base value",{exact:true})});
    await expect(recorded).toContainText("$0.00");
    await expect(recorded).toContainText("1 unknown amounts excluded");
    await expect(recorded).toContainText("not collected revenue");
    const collected=page.locator("article").filter({has:page.getByText("Actually collected",{exact:true})});
    await expect(collected).toContainText("$129.50");
    await expect(page.getByRole("heading",{name:"Subscription records"})).toBeVisible();
    await expect(page.locator("main")).not.toContainText("$109.00");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("recorded-subscription-amount.png"),fullPage:true});
  });
}
