import { expect, test as base } from "@playwright/test";

// Keep console output intact and make hydration regressions fail acceptance.
export const test = base.extend<{ hydrationAudit: void }>({
  hydrationAudit: [async ({ page }, use) => {
    const errors: string[] = [];
    const record = (message: string) => {
      if (/hydration|hydrated|server rendered HTML|Minified React error #(418|419|421|422|423|425)/i.test(message)) {
        errors.push(message);
      }
    };
    page.on("console", (message) => {
      // Firefox exposes React's successful console.timeStamp("Hydrated")
      // performance marker. It is not a warning or hydration mismatch.
      // The protocol event is absent from Playwright's console-type union.
      if (String(message.type()) === "timeStamp" && message.text() === "Hydrated") return;
      record(message.text());
    });
    page.on("pageerror", (error) => record(error.message));
    await use();
    expect(errors, "The application must hydrate without mismatches").toEqual([]);
  }, { auto: true }],
});

// Playwright's caret:"hide" mutates inline attributes on unhydrated controls.
// A temporary stylesheet produces the same screenshot without changing React's DOM.
export const screenshotCaret = {
  caret: "initial" as const,
  style: "input, textarea, [contenteditable] { caret-color: transparent !important; }",
};
