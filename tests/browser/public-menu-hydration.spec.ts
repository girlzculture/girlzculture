import { expect, test } from "@playwright/test";

test("public menu waits for hydration before accepting its first interaction", async ({ page }) => {
  // Match the existing menu fixture: location onboarding has already been dismissed.
  await page.addInitScript(() => localStorage.setItem("girlz-culture-mobile-location-prompt-v1", JSON.stringify({ dismissedAt: Date.now(), outcome: "dismissed" })));
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  let heldScripts = 0;
  await page.route("**/_next/static/**/*.js*", async route => {
    heldScripts++;
    await scriptsReady;
    await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto("/", { waitUntil: "commit" });
    const trigger = page.getByRole("button", { name: "Open navigation menu", exact: true });
    await expect(trigger).toBeVisible();
    await expect.poll(() => heldScripts).toBeGreaterThan(0);
    await expect(trigger).toBeDisabled();
    releaseScripts();
    await expect(trigger).toBeEnabled();
    await trigger.click();
    await expect(page.locator("[data-public-mobile-menu]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-public-mobile-menu]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } finally { releaseScripts(); }
});
