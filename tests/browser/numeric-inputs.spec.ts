import { expect, test } from "@playwright/test";

test("Backspace, Delete, selection, decimals and bounds behave as editors", async ({
  page,
}, testInfo) => {
  test.skip(
    !["chromium", "firefox", "webkit"].includes(testInfo.project.name),
    "The three desktop engine projects cover numeric keyboard editing.",
  );
  await page.goto("/internal/acceptance/numeric");
  const quantity = page.getByLabel("Quantity");
  await quantity.focus();
  await quantity.press("End");
  await quantity.press("Backspace");
  await expect(quantity).toHaveValue("1234");
  await quantity.press("Home");
  await quantity.press("Delete");
  await expect(quantity).toHaveValue("234");
  await quantity.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await quantity.press("Backspace");
  await expect(quantity).toHaveValue("");
  await quantity.pressSequentially("42");
  await expect(quantity).toHaveValue("42");

  const price = page.getByLabel("Price");
  await price.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await price.pressSequentially("12.34");
  await expect(price).toHaveValue("12.34");
  await price.press("a");
  await expect(price).toHaveValue("12.34");

  await quantity.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await quantity.pressSequentially("101");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByRole("status")).toContainText("no more than 100");
});

test("valid numeric clipboard text pastes without cursor jumps", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Clipboard permissions vary by engine.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/internal/acceptance/numeric");
  await page.evaluate(() => navigator.clipboard.writeText("123.45"));
  const price = page.getByLabel("Price");
  await price.focus();
  await price.press("Control+A");
  await price.press("Control+V");
  await expect(price).toHaveValue("123.45");
  await expect(price).toBeFocused();
});
