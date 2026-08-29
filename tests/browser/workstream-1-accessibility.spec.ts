import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectReadableContrast,
  expectVisibleFocusIndicator,
  formatAxeViolations,
  getEffectiveContrast,
} from "./helpers/accessibility";

const fixtureRoute = "/internal/acceptance/accessibility-states";

const auditedRoutes = [
  { feature: "public homepage", route: "/" },
  { feature: "public salon discovery", route: "/salons" },
  { feature: "public style discovery", route: "/styles" },
  { feature: "public how it works", route: "/how-it-works" },
  { feature: "public about", route: "/about" },
  { feature: "public blog", route: "/blog" },
  { feature: "public partner", route: "/partner" },
  { feature: "public contact", route: "/contact" },
  { feature: "customer authentication", route: "/login" },
  { feature: "salon authentication", route: "/salon/login" },
  { feature: "admin authentication", route: "/admin/login" },
  { feature: "legal and policies", route: "/legal" },
  { feature: "public salon profile", route: "/salon/acceptance-salon" },
  {
    feature: "stylist profile (deterministic acceptance route)",
    route: "/internal/acceptance/stylist-profile",
  },
  { feature: "owner dashboard acceptance", route: "/internal/acceptance/owner-workflows" },
  { feature: "admin finance acceptance", route: "/internal/acceptance/admin-workflows/finance" },
  { feature: "admin report table acceptance", route: "/internal/acceptance/admin-workflows/customers" },
  { feature: "readability state acceptance", route: fixtureRoute },
] as const;

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const fixtureAxeSurfaces = [
  { feature: "customer account (deterministic fixture)", selector: "#customer-account" },
  { feature: "salon and stylist states (deterministic fixture)", selector: "#salon-stylist" },
  { feature: "booking and checkout totals (deterministic fixture)", selector: "#booking-checkout" },
  { feature: "finance report and table (deterministic fixture)", selector: "#admin-finance" },
  { feature: "featured and advertising disclosure (deterministic fixture)", selector: "#advertising-fixture" },
  { feature: "policy content (deterministic fixture)", selector: "#policy-fixture" },
  { feature: "empty and completed states (deterministic fixture)", selector: "#customer-account" },
  { feature: "toast, alert, disabled, unavailable, and loading states (deterministic fixture)", selector: "#interaction-fixture" },
  { feature: "validation states (deterministic fixture)", selector: "#validation-fixture" },
  { feature: "state inventory (deterministic fixture)", selector: "#state-inventory" },
] as const;

async function visitReady(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `${route} should return a document response`).not.toBeNull();
  expect(response!.status(), `${route} should load without an HTTP error`).toBeLessThan(400);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (route === fixtureRoute) {
    await expect(page.getByTestId("acceptance-harness-ready")).toHaveAttribute("data-hydrated", "true");
  }
}

async function tabUntilFocused(
  page: Page,
  target: Locator,
  label: string,
  options: { reverse?: boolean; limit?: number } = {},
) {
  await expect(target, `${label} must be visible before keyboard traversal`).toBeVisible();
  for (let index = 0; index < (options.limit ?? 120); index += 1) {
    await page.keyboard.press(options.reverse ? "Shift+Tab" : "Tab");
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  await expect(target, `${label} was not reachable through ${options.reverse ? "Shift+Tab" : "Tab"}`).toBeFocused();
}

async function clearDocumentFocus(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

test.describe("Workstream 1 WCAG acceptance", () => {
  for (const { feature, route } of auditedRoutes) {
    test(`${feature} has no automated WCAG A/AA violations`, async ({ page }) => {
      await visitReady(page, route);
      const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      expect(
        formatAxeViolations(results.violations),
        `${feature} (${route}) failed Axe. Color contrast remains enabled and no page regions or rules are excluded.`,
      ).toEqual([]);
    });
  }

  for (const { feature, selector } of fixtureAxeSurfaces) {
    test(`${feature} has no automated WCAG A/AA violations`, async ({ page }) => {
      await visitReady(page, fixtureRoute);
      const results = await new AxeBuilder({ page })
        .include(selector)
        .withTags(axeTags)
        .analyze();
      expect(
        formatAxeViolations(results.violations),
        `${feature} failed scoped Axe acceptance. The complete fixture is also audited above; color contrast remains enabled and no rules are disabled.`,
      ).toEqual([]);
    });
  }

  test("modal dialog (deterministic fixture) has no automated WCAG A/AA violations", async ({ page }) => {
    await visitReady(page, fixtureRoute);
    await page.getByTestId("modal-trigger").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(axeTags)
      .analyze();
    expect(
      formatAxeViolations(results.violations),
      "modal dialog fixture failed scoped Axe acceptance; color contrast remains enabled and no rules are disabled.",
    ).toEqual([]);
  });
});

test.describe("Workstream 1 deterministic state semantics", () => {
  test.beforeEach(async ({ page }) => {
    await visitReady(page, fixtureRoute);
  });

  test("all named text roles meet effective computed contrast", async ({ page }) => {
    const roles = page.locator("[data-contrast-role]");
    const count = await roles.count();
    expect(count, "the state fixture must expose a meaningful contrast-role inventory").toBeGreaterThan(15);

    for (let index = 0; index < count; index += 1) {
      const role = roles.nth(index);
      const roleName = await role.getAttribute("data-contrast-role");
      await expectReadableContrast(role, `contrast role ${roleName ?? index}`);
    }
  });

  test("placeholder and entered text are both readable and measured independently", async ({ page }) => {
    const input = page.getByTestId("placeholder-entered-input");
    const placeholder = await expectReadableContrast(input, "support email placeholder", {
      pseudo: "::placeholder",
    });
    await input.fill("janel@example.com");
    const entered = await expectReadableContrast(input, "support email entered value");
    expect(entered.foreground, "entered text must not silently inherit placeholder opacity").not.toBe(
      placeholder.foreground,
    );
  });

  test("select prompt and entered selection are readable and semantically distinct", async ({ page }) => {
    const select = page.getByTestId("prompt-select");
    await expect(select).toHaveRole("combobox");
    await expect(select).toHaveValue("");
    await expect(select.locator("option:checked")).toHaveText("Choose a booking category");
    const prompt = await expectReadableContrast(select, "booking category prompt");

    await select.selectOption("booking");
    await expect(select).toHaveValue("booking");
    await expect(select.locator("option:checked")).toHaveText("Booking support");
    const entered = await expectReadableContrast(select, "booking category entered selection");
    expect(entered.foreground, "entered selection must not retain prompt styling").not.toBe(
      prompt.foreground,
    );
  });

  test("customer login placeholder and entered value retain readable contrast", async ({ page }) => {
    await visitReady(page, "/login");
    const input = page.getByLabel("Email");
    await expectReadableContrast(input, "customer login email placeholder", {
      pseudo: "::placeholder",
      requireSolidBackground: false,
    });
    await input.fill("customer@example.com");
    await expectReadableContrast(input, "customer login email entered value", {
      requireSolidBackground: false,
    });
  });

  test("public footer, newsletter, and legal content use readable computed colors and a 3:1 focus indicator", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await visitReady(page, "/legal");

    const policySection = page.locator('[aria-labelledby="policy-list-heading"]');
    await expectReadableContrast(
      policySection.getByRole("heading", { name: "Choose a document" }),
      "legal document-list heading",
    );
    await expectReadableContrast(
      policySection.getByText(/Each policy opens on its own shareable page/),
      "legal document-list guidance",
    );

    const footer = page.locator("footer");
    const newsletter = footer.locator("form:visible").first();
    const newsletterRegion = newsletter.locator("..");
    const newsletterInput = newsletter.locator('input[type="email"]');
    const newsletterButton = newsletter.getByRole("button", { name: "Subscribe" });
    const newsletterLabel = newsletter.locator('label[for="footer-email"]');
    await expectReadableContrast(
      footer.getByRole("heading", { name: "Stay in the loop" }).first(),
      "footer newsletter heading",
    );
    await expectReadableContrast(
      newsletterRegion.locator("p").first(),
      "footer ordinary newsletter guidance",
    );
    await expectReadableContrast(newsletterLabel, "footer newsletter accessible label");
    await expectReadableContrast(newsletterInput, "footer newsletter placeholder", {
      pseudo: "::placeholder",
    });
    await newsletterInput.fill("reader@example.com");
    await expectReadableContrast(newsletterInput, "footer newsletter entered email");
    await expectReadableContrast(newsletterButton, "footer newsletter submit button");

    const footerLink = footer.locator("a:visible").first();
    await footerLink.scrollIntoViewIfNeeded();
    await footerLink.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(footerLink).toBeFocused();
    const focus = await expectVisibleFocusIndicator(footerLink, "public footer link");
    expect(focus.ratio, "footer focus indicator must contrast at least 3:1 with the footer").toBeGreaterThanOrEqual(3);

    // The deterministic acceptance backend intentionally publishes no legal
    // navigation records. Exercise the on-dark legal-link contract using the
    // clearly labelled internal fixture rather than pretending fixture content
    // came from production configuration.
    await visitReady(page, fixtureRoute);
    const legalLink = page.getByTestId("footer-legal-link");
    await expect(legalLink).toBeVisible();
    await expectReadableContrast(legalLink, "deterministic footer legal-link fixture");
  });

  test("customer-account and booking-total fixtures have direct computed contrast evidence", async ({ page }) => {
    const customer = page.locator("#customer-account");
    await expectReadableContrast(
      customer.getByRole("heading", { name: "Welcome back, Janel" }),
      "customer account heading",
    );
    await expectReadableContrast(
      customer.getByText(/Acceptance Salon · September 12/),
      "customer upcoming-booking metadata",
    );
    await expectReadableContrast(
      customer.getByTestId("completed-state"),
      "customer completed-booking state",
    );

    const totals = page.getByTestId("booking-totals");
    for (const term of await totals.locator("dt").all()) {
      await expectReadableContrast(term, `booking total label: ${await term.textContent()}`);
    }
    for (const value of await totals.locator("dd").all()) {
      await expectReadableContrast(value, `booking total value: ${await value.textContent()}`);
    }
    await expect(totals.getByText("$24.00")).toBeVisible();
    await expect(totals.getByText("$216.00")).toBeVisible();
  });

  test("admin customer and booking routes plus the deterministic finance report expose readable records", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await visitReady(page, "/internal/acceptance/admin-workflows/customers/customer-1");
    await expectReadableContrast(
      page.getByRole("heading", { name: "Janel Smith" }),
      "admin customer-account record heading",
    );
    await expectReadableContrast(
      page.getByRole("heading", { name: "Favorites & account activity" }),
      "admin customer-account activity heading",
    );

    await visitReady(page, "/internal/acceptance/admin-workflows/bookings");
    const deposit = page.getByText("Deposit $24.00", { exact: true });
    await expect(deposit).toBeVisible();
    await expectReadableContrast(deposit, "admin booking deposit total");

    await visitReady(page, fixtureRoute);
    await expectReadableContrast(
      page.getByRole("heading", { name: "Deposit report" }),
      "deterministic admin finance report heading",
    );
    const depositsCollected = page.getByText("Deposits collected", { exact: true });
    await expect(depositsCollected).toBeVisible();
    await expectReadableContrast(depositsCollected, "admin finance deposits metric");
    await expectReadableContrast(
      page.getByTestId("finance-deposits-collected"),
      "admin finance deposits value",
    );
    const balanceDue = page.getByText("Balance due at salons", { exact: true });
    await expect(balanceDue).toBeVisible();
    await expectReadableContrast(balanceDue, "admin finance balance metric");
    await expectReadableContrast(
      page.getByTestId("finance-balance-due"),
      "admin finance balance value",
    );
  });

  test("disabled and unavailable controls cannot activate by pointer, keyboard, or script", async ({ page }) => {
    const counter = page.getByTestId("activation-count");
    const blockedCounter = page.getByTestId("blocked-attempt-count");
    await expect(counter).toHaveText("0");
    await expect(blockedCounter).toHaveText("0");

    await page.getByTestId("active-control").click();
    await expect(counter, "the positive control proves the activation counter is live").toHaveText("1");

    async function physicalClick(control: Locator) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    }

    const nativeDisabledControls = [
      page.getByTestId("native-disabled-control"),
      page.getByTestId("disabled-input"),
      page.getByTestId("disabled-textarea"),
      page.getByTestId("disabled-select"),
      page.getByTestId("disabled-checkbox"),
      page.getByTestId("disabled-radio"),
    ];

    for (const control of nativeDisabledControls) {
      await expect(control).toBeDisabled();
      await physicalClick(control);
      await control.evaluate((element) => (element as HTMLElement).click());
      const tookFocus = await control.evaluate((element) => {
        (element as HTMLElement).focus();
        return document.activeElement === element;
      });
      expect(tookFocus, "native disabled controls must be skipped by keyboard focus").toBe(false);
      await expect(counter).toHaveText("1");
    }
    await expect(page.getByTestId("disabled-checkbox")).not.toBeChecked();
    await expect(page.getByTestId("disabled-radio")).not.toBeChecked();

    const ariaDisabledControls = [
      page.getByTestId("aria-disabled-control"),
      page.getByTestId("aria-disabled-link"),
      page.getByTestId("aria-disabled-custom"),
      page.getByTestId("aria-disabled-option"),
    ];

    for (const control of ariaDisabledControls) {
      const beforeBlocked = Number(await blockedCounter.textContent());
      await expect(control).toHaveAttribute("aria-disabled", "true");
      await physicalClick(control);
      await control.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Space");
      await control.evaluate((element) => (element as HTMLElement).click());
      await expect(counter).toHaveText("1");
      expect(
        Number(await blockedCounter.textContent()),
        "the guarded handler must observe attempts while refusing activation",
      ).toBeGreaterThan(beforeBlocked);
    }

    expect(page.url(), "the aria-disabled link must not change the location fragment").not.toContain(
      "#activation-target",
    );
    await expect(page.getByTestId("aria-disabled-option")).toHaveAttribute("aria-selected", "false");

    const loading = page.getByTestId("loading-control");
    const loadingBlockedBefore = Number(await blockedCounter.textContent());
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(loading).toHaveAttribute("data-visual-state", "loading");
    await physicalClick(loading);
    await loading.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await loading.evaluate((element) => (element as HTMLElement).click());
    await expect(counter).toHaveText("1");
    expect(Number(await blockedCounter.textContent())).toBeGreaterThan(loadingBlockedBefore);
  });

  test("selected, unavailable, loading, completed, and error states expose non-color semantics", async ({ page }) => {
    const stylist = page.getByTestId("selected-stylist");
    await expect(stylist).toHaveAttribute("aria-pressed", "false");
    await stylist.click();
    await expect(stylist).toHaveAttribute("aria-pressed", "true");
    await expect(stylist).toContainText("Selected");
    await expect(page.getByTestId("unavailable-control")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("loading-control")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("loading-control")).toHaveAttribute("data-visual-state", "loading");
    await expect(page.getByTestId("loading-control").getByRole("status")).toHaveText(
      "Loading availability…",
    );
    await expect(page.getByTestId("completed-state")).toContainText("Completed");
    await expect(page.getByTestId("error-state")).toHaveAttribute("role", "alert");

    for (const testId of [
      "unavailable-control",
      "aria-disabled-control",
      "aria-disabled-link",
      "aria-disabled-custom",
      "aria-disabled-option",
    ]) {
      const unavailable = page.getByTestId(testId);
      await expect(unavailable).toHaveAttribute("data-visual-state", "unavailable");
      await expect(unavailable).not.toHaveAttribute("data-visual-state", /active|selected/);
    }

    const visualStyles = await page.locator("body").evaluate(() => {
      const read = (testId: string) => {
        const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
        if (!element) throw new Error(`Missing visual state control: ${testId}`);
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          border: style.borderColor,
          borderStyle: style.borderStyle,
          borderWidth: style.borderWidth,
          color: style.color,
          cursor: style.cursor,
          boxShadow: style.boxShadow,
        };
      };
      return {
        disabled: read("native-disabled-control"),
        loading: read("loading-control"),
      };
    });
    expect(visualStyles.loading.cursor).toBe("progress");
    expect(
      `${visualStyles.loading.background}|${visualStyles.loading.border}|${visualStyles.loading.color}`,
      "loading must remain visually distinct from the global disabled surface/foreground/border contract",
    ).not.toBe(
      `${visualStyles.disabled.background}|${visualStyles.disabled.border}|${visualStyles.disabled.color}`,
    );

    const stateNames = [
      "active",
      "selected",
      "inactive",
      "disabled",
      "unavailable",
      "loading",
      "completed",
      "error",
    ] as const;
    for (const state of stateNames) {
      await expect(page.locator(`[data-state="${state}"]`), `${state} must have a visible text label`).toContainText(
        new RegExp(state, "i"),
      );
    }

    const stateSignatures = await page.locator("[data-state]").evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          state: element.getAttribute("data-state"),
          signature: [
            style.backgroundColor,
            style.borderColor,
            style.borderStyle,
            style.borderWidth,
            style.color,
            style.boxShadow,
          ].join("|"),
        };
      }),
    );
    const requiredSignatures = stateNames.map((state) => {
      const match = stateSignatures.find((entry) => entry.state === state);
      expect(match, `${state} must expose a computed visual-state signature`).toBeDefined();
      return match!.signature;
    });
    expect(
      new Set(requiredSignatures).size,
      `all named states must have pairwise-distinct non-color-aware visual signatures: ${JSON.stringify(stateSignatures)}`,
    ).toBe(stateNames.length);
  });

  test("keyboard focus is visible and dialog focus is trapped, closable, and restored", async ({ page }) => {
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.keyboard.press("Tab");
    const firstKeyboardTarget = page.locator(":focus");
    await expect(firstKeyboardTarget).toBeVisible();
    await expectVisibleFocusIndicator(firstKeyboardTarget, "first keyboard target");

    const trigger = page.getByTestId("modal-trigger");
    await trigger.click();
    const close = page.getByTestId("modal-close");
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Review totals" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("modal-overlay")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("focus-visible covers button, input, select, textarea, summary, and enabled custom control", async ({ page }) => {
    const targets = [
      { locator: page.getByTestId("active-control"), label: "enabled button" },
      { locator: page.getByTestId("placeholder-entered-input"), label: "text input" },
      { locator: page.getByTestId("prompt-select"), label: "native select" },
      { locator: page.getByLabel("Message"), label: "textarea" },
      { locator: page.getByTestId("keyboard-summary"), label: "summary disclosure" },
      { locator: page.getByTestId("keyboard-custom-control"), label: "custom role button" },
    ];

    for (const target of targets) {
      await clearDocumentFocus(page);
      await tabUntilFocused(page, target.locator, target.label);
      await expectVisibleFocusIndicator(target.locator, target.label);
      await page.keyboard.press("Shift+Tab");
      await expect(target.locator, `${target.label} should move backward with Shift+Tab`).not.toBeFocused();
      await page.keyboard.press("Tab");
      await expect(target.locator, `${target.label} should be reachable again with Tab`).toBeFocused();
    }

    const summary = page.getByTestId("keyboard-summary");
    const details = summary.locator("..");
    await expect(details).not.toHaveAttribute("open", "");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details, "Enter should open a native summary disclosure").toHaveAttribute("open", "");
    await page.keyboard.press("Space");
    await expect(details, "Space should close a native summary disclosure").not.toHaveAttribute("open", "");

    const custom = page.getByTestId("keyboard-custom-control");
    const customCount = page.getByTestId("keyboard-custom-count");
    await custom.focus();
    await page.keyboard.press("Enter");
    await expect(customCount, "Enter should activate the custom role button once").toHaveText("1");
    await page.keyboard.press("Space");
    await expect(customCount, "Space should activate the custom role button once").toHaveText("2");
  });

  test("representative public, booking, owner, and platform-admin surfaces work by keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 1720, height: 1000 });

    await visitReady(page, "/");
    const publicStylesLink = page.locator('header a[href="/styles"]:visible').first();
    await clearDocumentFocus(page);
    await tabUntilFocused(page, publicStylesLink, "public Browse Styles navigation link");
    await expectVisibleFocusIndicator(publicStylesLink, "public Browse Styles navigation link");
    await page.keyboard.press("Shift+Tab");
    await expect(publicStylesLink).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(publicStylesLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/styles(?:\?|$)/);

    // This guarded route is explicitly labelled as deterministic acceptance
    // content and provides an actual SalonStyles disclosure without providers.
    await visitReady(page, "/internal/acceptance/salon-profile");
    const bookingChoice = page.getByRole("button", { name: /Knotless Braids/i }).first();
    await clearDocumentFocus(page);
    await tabUntilFocused(page, bookingChoice, "salon booking style disclosure");
    await expectVisibleFocusIndicator(bookingChoice, "salon booking style disclosure");
    await expect(bookingChoice).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(bookingChoice, "Space should expand the booking style").toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(bookingChoice, "Enter should collapse the booking style").toHaveAttribute("aria-expanded", "false");

    await visitReady(page, "/internal/acceptance/owner-workflows");
    const ownerSearch = page.getByRole("searchbox", { name: "Search bookings" });
    await clearDocumentFocus(page);
    await tabUntilFocused(page, ownerSearch, "owner booking search input");
    await expectVisibleFocusIndicator(ownerSearch, "owner booking search input");
    await page.keyboard.type("Monique");
    await page.keyboard.press("Tab");
    const ownerSearchButton = page.getByRole("button", { name: "Search", exact: true });
    await expect(ownerSearchButton).toBeFocused();
    await expectVisibleFocusIndicator(ownerSearchButton, "owner booking search submit button");
    await page.keyboard.press("Shift+Tab");
    await expect(ownerSearch).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=Monique/);

    await visitReady(page, "/internal/acceptance/admin-workflows/customers");
    const adminStatus = page.getByRole("combobox", { name: "Customer status" });
    await clearDocumentFocus(page);
    await tabUntilFocused(page, adminStatus, "platform-admin customer status select");
    await expectVisibleFocusIndicator(adminStatus, "platform-admin customer status select");
    await page.keyboard.press("Shift+Tab");
    const adminSearch = page.getByPlaceholder("Search customer name or email");
    await expect(adminSearch).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(adminStatus).toBeFocused();

    const customerLink = page.getByRole("link", { name: /Janel Smith/i }).first();
    await customerLink.evaluate((element) => {
      element.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          element.setAttribute("data-keyboard-activated", "true");
        },
        { once: true },
      );
    });
    await clearDocumentFocus(page);
    await tabUntilFocused(page, customerLink, "platform-admin customer record link");
    await expectVisibleFocusIndicator(customerLink, "platform-admin customer record link");
    await page.keyboard.press("Enter");
    await expect(customerLink, "Enter should activate the platform-admin record link").toHaveAttribute(
      "data-keyboard-activated",
      "true",
    );
  });

  test("validation identifies, describes, and focuses errors before completing locally", async ({ page }) => {
    await page.getByRole("button", { name: "Validate fixture" }).click();
    const email = page.getByLabel("Email address");
    const message = page.getByLabel("Message");
    await expect(page.getByTestId("validation-summary")).toBeVisible();
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-describedby", "acceptance-email-error");
    await expect(message).toHaveAttribute("aria-invalid", "true");

    await email.fill("janel@example.com");
    await message.fill("Please help me review my upcoming acceptance booking.");
    await page.getByRole("button", { name: "Validate fixture" }).click();
    await expect(page.getByTestId("validation-completed")).toBeVisible();
    await expect(page.getByTestId("validation-completed")).toContainText("Nothing was sent");
    await expect(page.getByTestId("validation-summary")).toHaveCount(0);
  });

  test("computed helper resolves alpha text through ancestor backgrounds", async ({ page }) => {
    const supportingText = page.locator('[data-contrast-role="supporting-text"]');
    const result = await getEffectiveContrast(supportingText);
    expect(result.background).toMatch(/^rgba\(/);
    expect(result.foreground).toMatch(/^rgba\(/);
    expect(result.ratio).toBeGreaterThanOrEqual(result.requiredRatio);
  });

  test("computed helper applies text, element, and ancestor opacity exactly once", async ({ page }) => {
    const alphaColor = await getEffectiveContrast(page.getByTestId("contrast-alpha-color"));
    const elementOpacity = await getEffectiveContrast(page.getByTestId("contrast-element-opacity"));
    const ancestorOpacity = await getEffectiveContrast(page.getByTestId("contrast-ancestor-opacity"));

    expect(
      alphaColor.ratio,
      "50% black alpha on white has a known WCAG contrast near 4:1",
    ).toBeCloseTo(4, 1);
    expect(
      Math.abs(elementOpacity.ratio - alphaColor.ratio),
      "50% element opacity must produce the same result as 50% text alpha within browser color-rounding tolerance, not be applied twice",
    ).toBeLessThan(0.05);
    expect(
      ancestorOpacity.ratio,
      "a half-opacity white ancestor over black yields black text against a mid-gray effective background",
    ).toBeCloseTo(5.32, 1);
    expect(ancestorOpacity.background).toMatch(/rgba\(12[78], 12[78], 12[78], 1\.000\)/);
    expect(ancestorOpacity.foreground).toBe("rgba(0, 0, 0, 1.000)");
  });
});
