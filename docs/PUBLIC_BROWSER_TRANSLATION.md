# Public browser translation

Public content is authored in English and is available to browser-native translation. The incomplete first-party selector has been removed from public navigation and is hidden on other public login/booking surfaces. Internal admin, owner dashboard, and customer account localization remains available, including saved preferences, the Translation Manager, published Engine overrides, and message translation. No translation service, scraping proxy, or third-party request was added.

## Baseline cause

The source and rendered baseline at `b7dbc88ad31ab22f55018e0603ead8483fd33924` had no global `google/notranslate` metadata, `notranslate` class, or `translate="no"` ancestor. The custom `data-no-translate` marker belonged to the app's own localization bridge; it is not a browser translation opt-out.

Four actual conflicts were identified:

1. A saved `gc_locale` cookie changed the server document language even though most public content still rendered English. Client locale restoration could do the same from local storage or an account preference. The public selector only covered a subset of the experience.
2. `DocumentLocalizationBridge` observed and rescanned the entire public body, including text changes made by a browser translator. Even its English mode normalized text whitespace. The app and native translator therefore competed for the same DOM.
3. `ExpandableSalonDescription` rendered its preview and conditional ellipsis as two sibling text nodes. Replacing those nodes with nested `<font>` elements (a representative translator operation) and clicking **Read more** reproduced `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.` React's error boundary caught it and displayed “This page needs another moment.” A `pageerror` listener alone missed this caught crash; the regression checks both console errors and the rendered error boundary.
4. The actual `BusinessSignupLanding` hero heading had the same structural risk: its default accented heading combined a raw `Grow Your ` text node with a `<span>Beauty Business</span>`. In the CMS draft preview, replacing `#business-hero-title` text with the translator helper and then changing the heading reproduced the same `NotFoundError` on `removeChild` and the page error boundary. The failure trace confirmed that the content change attempted to remove a text node already detached by the translator.

The description reproduction used the existing guarded `/internal/acceptance/salon-profile` route and its actual public description component, not a synthetic component. It was run against a production build whose `src` and `public` trees were identical to the baseline. The second reproduction used the existing CMS acceptance fixture and real landing renderer while editing the previewed heading.

## Correction and boundaries

- Proxy forwards the effective route and dashboard surface through overwritten internal request headers. The server uses them to render English `lang`/`dir` for public content; incoming spoofed values cannot change that decision. Existing host redirects, rewrites, and private robots behavior remain intact.
- The provider uses the saved first-party locale only on `/admin`, `/superadmin`, `/salon/dashboard`, `/account`, and the existing dashboard host surfaces. Public routes always use English source messages. Client route transitions update document attributes without overwriting public text. A public visit does not delete the saved internal preference.
- The DOM localization bridge runs only on managed internal surfaces. English published Engine message overrides remain available to normal React rendering; all existing review/publish/message translation infrastructure is retained.
- High-level public wrappers allow translation. Essential copy remains text in the DOM. No global DOM API patch, exception swallowing, or translator opt-out was added.
- The description renders its text and ellipsis as one string child, so expansion updates a stable element instead of removing a detached text sibling. `LocalizedText` also supplies a stable inline element for text beside icons or optional badges.
- The hero `<h1>` has the semantic React key `${hero.heading}:${hero.accent}`. Changing the heading or accent replaces that whole element instead of reconciling potentially detached text inside it; unrelated rerenders retain it. The key adds no DOM wrapper or visual change and does not alter the approved heading styling.

## Verification

`tests/browser/public-translation.spec.ts` covers source language in actual server HTML and hydrated DOM, saved preferences, spoofed request headers, internal selector and Engine source translation, internal/public client navigation, the exact description crash, translated login interactions, and translated category routing and waitlist submission. The mutation helper intentionally removes original text nodes, rather than only updating their values. It also checks that subsequent public updates leave translated text intact.

`tests/browser/public-translation-core.spec.ts` covers public/internal route boundaries and actual proxy pass/rewrite/redirect metadata. Existing localization Engine and completion verifiers retain their workflow, fallback, human-review, dashboard, and message-translation checks.

The CMS test **Business Signup composition survives translated heading replacement while its content changes** failed before the heading-key correction and passed afterward (1/1 focused). Related local CMS coverage also passed for versioned sections through schedule, unpublish, archive, restore and publish with the expected fixture audit event sequence (1/1), and editor/private-preview usability at 390, 768, 1440 and 1920 pixels (4/4). These results establish local application behavior, not a live database history or isolated deployed-CMS acceptance run.

These are automated compatibility checks. They do not prove Google's proprietary translation quality, every extension's DOM behavior, or translated layout in every language. Native translator quality and representative human review remain separate from app compatibility. No production data or database state is needed for these tests.
