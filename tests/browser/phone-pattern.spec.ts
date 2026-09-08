import { expect, test } from "@playwright/test";

test("salon phone input enforces its actual HTML pattern under UnicodeSets semantics", async ({ page }) => {
  const patternErrors: string[] = [];
  page.on("console", (message) => {
    if (/Pattern attribute value|Invalid regular expression/i.test(message.text())) patternErrors.push(message.text());
  });
  await page.goto("/salon/signup");
  const phone = page.getByRole("textbox", { name: "Phone Number" });
  const cases = [
    ["2125550123", true], ["12125550123", true], ["+12125550123", true],
    ["212-555-0123", true], ["212.555.0123", true], ["212 555 0123", true],
    ["(212)5550123", true], ["(212) 555-0123", true], ["+1 (212) 555-0123", true],
    ["1.(212).555.0123", true], ["212.555-0123", true],
    ["1125550123", false], ["0125550123", false], ["212555012", false],
    ["21255501234", false], ["+442125550123", false], ["212ABC0123", false],
    ["212/555/0123", false], ["212--555-0123", false], ["2125550123 ext 1", false],
  ] as const;
  // Set native input values directly so React's formatter cannot hide a broken
  // pattern by normalizing the test cases before browser validation sees them.
  const results = await phone.evaluate((element: HTMLInputElement, samples) => {
    const modern = new RegExp(element.pattern, "v");
    return samples.map(([value, expected]) => {
      element.value = value;
      return { value, expected, regexValid: modern.test(value), valid: element.checkValidity(), patternMismatch: element.validity.patternMismatch };
    });
  }, cases.map(([value, expected]) => [value, expected] as [string, boolean]));
  for (const result of results) {
    expect(result.valid, result.value).toBe(result.expected);
    expect(result.regexValid, result.value).toBe(result.expected);
    expect(result.patternMismatch, result.value).toBe(!result.expected);
  }
  await phone.fill("");
  expect(await phone.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  expect(patternErrors).toEqual([]);
});

test("formatted salon phone number remains browser-valid without changing its digits", async ({ page }) => {
  await page.goto("/salon/signup");
  const phone = page.getByRole("textbox", { name: "Phone Number" });
  await phone.fill("2125550123");
  await expect(phone).toHaveValue("+1 (212) 555-0123");
  expect(await phone.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
});
