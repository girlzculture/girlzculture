# Business Signup content editor

Open **Platform Admin → Content Management → Business Signup Landing Page** (`/admin/content/page-business-signup`). This edits the existing `/business/signup` page and its category waitlist copy. It uses the existing CMS permissions and publication workflow.

## Edit the page

| Editor group | Controls |
| --- | --- |
| A. Header | Show/hide logo; text or image logo; logo text, image, alt text, size and left/center alignment; login visibility, helper text, label and internal destination. |
| B. Hero | Show/hide hero; heading, supporting text; up to eight additional paragraphs with visibility, Move up/down and Remove; accent, overlay strength, height and alignment; image/GIF/MP4/none plus still poster. |
| C. Business Selector | Show/hide the selector; heading and supporting text. |
| D. Business Categories | Expand a category to edit its display name, visibility, order, card image, destination mode and optional waitlist heading/description/image overrides. |
| E. Waitlist | Eyebrow, heading template, description, submit label, success copy, privacy copy and optional support text. Use `{businessType}` for the selected category name. |
| F. Trust Section | Visibility, icon, heading, description and order for each of the three existing trust blocks. |
| G. Page Sections | Add a predefined section, select its placement and layout, edit its content, enable/disable it, reorder it or remove it. |

All eight category identities remain fixed even when their display names change. Hair Salon & Braiding is the only registered live application and opens `/business/signup/hair`. Other categories use their category-specific waitlist. Selecting an unsupported live mode can be saved as a draft, but publication is refused until a dedicated application is registered. Use visibility to hide a category; renaming it does not change its URL identity.

Clear optional copy to omit it. Clear category waitlist heading/description overrides to return to the shared templates; turn off **use a separate waitlist image** to return to the card image. Hide the hero, selector, login area or a module with its visibility control instead of deleting required fields.

## Add a section

Choose **New section type → Add page section**. Each section can go **after hero** or **after selector**. Move controls set order; placement determines which part of the page receives it. Up to 16 sections are supported, with up to 12 items in each item-based section.

| Type | Layouts | Additional content |
| --- | --- | --- |
| Text | Default, centered | Heading, subheading and body. |
| Image text | Left, right, stacked, wide | Image and text. |
| Features | Grid, strip | Icon, heading and body per feature. |
| Stats | Grid, strip | Value and label per statistic. |
| Quote | Card, centered | Quotation in Body; optional author, role and portrait. |
| CTA | Centered, split | Text and a labelled internal action link. |
| FAQ | Accordion, list | Questions and answers; accordion uses native accessible disclosure controls. |
| Gallery | Grid, strip | Images with individual alt text and crop controls. |
| Media | Wide, contained | Still image, GIF or MP4 with poster/fallback. |

Every section also supports an optional action link. Both label and destination are required when that action is enabled. Destinations must be safe internal paths. Validation rejects external or malformed paths; confirm the chosen internal page exists before publishing. The editor does not accept arbitrary HTML, scripts, CSS, embeds or external URLs. Disabled incomplete sections may remain in a draft; enabled sections must be complete before publication.

## Media

Use the image upload controls or an existing local/Content Management asset URL. **Focal X/Y** run from 0–100; 50/50 centers the image. **Cover** fills and crops its frame; **contain** preserves the full image with surrounding space. Check both phone and desktop crops and provide meaningful alt text where the image conveys information.

MP4 uploads use the existing authenticated Content Management pipeline: H.264, at most 12 MB and two minutes. GIFs and videos need a separate still poster. Playback is muted and respects reduced motion; posters remain available during loading or failure. Publication verifies registered upload metadata, not only filename extensions, and rejects an animated or video poster. Image-only slots reject videos.

Wait for uploads to finish before the final save/publication. A retry can resume a pending video upload. Removing or replacing an image field does not immediately delete an asset retained by another published/scheduled snapshot.

## Save, preview and publish

1. **Preview draft** renders the current editor content inside the admin workspace. It does not save or publish. Validation errors are shown there. While the preview is open, publication actions sit below it so they do not cover the page. **Preview live** opens the current public page instead.
2. **Save draft** saves your edits while retaining the existing public snapshot and any already queued scheduled snapshot. Changing a draft does not change that queued snapshot; use **Schedule** again to replace it.
3. **Publish page** validates and publishes the current snapshot immediately. Wait for the verified result and inspect the saved/public timestamps.
4. **Schedule** requires a future date/time. Check the returned queued timestamp. The previous published snapshot stays live until the queued snapshot becomes due.
5. **Unpublish** removes public availability and cancels a queued publication. **Archive** also marks the record archived. Neither action is a permanent content deletion.
6. **Restore as draft** returns an archived record to editing without making it public. Review it and explicitly publish when appropriate.

Keep a copy of unsaved work if a stale-revision warning appears, then reload and reconcile it with the newer saved record. Do not overwrite another administrator's revision blindly. The current workspace shows publication state and timestamps; it does not add a new History/Rollback screen. The existing backend retains action-specific management events and publication snapshots.

## Engineering safeguards and current verification limits

The versioned document stays in `content_pages.labels.business_signup`. The v1 adapter adds empty module/hero-text lists and a visible selector in memory; an untouched v1 page retains its existing composition. Opening the editor does not rewrite a seed or published row. This v2 extension requires no SQL migration or parallel content table.

Sections, items and added hero paragraphs have stable generated IDs. Draft merging applies an upload callback's changed fields to the latest matching ID, preserving unrelated newer copy/order edits and avoiding recreation of a deleted item. Edits finishing during save verification remain draft edits and need another save/publication. Server validation, expected-revision checks and the existing atomic save/audit operation remain authoritative. Public rendering reads public snapshots; waitlist intake fails closed if a valid published configuration is unavailable.

Public pages advertise English source content and allow browser-native translation. The incomplete public language selector is removed; internal admin/account/dashboard and message localization remain. See [Public browser translation](PUBLIC_BROWSER_TRANSLATION.md) for the reproduced crash, correction and test limits.

Local fixtures exercise the real editor, renderer and application API logic, including v2 sections through schedule, unpublish, archive, restore and publish with the expected fixture audit event sequence. They are not a live database history or deployed-CMS acceptance environment. No isolated Supabase project is available for this work, and Netlify Deploy Preview backend isolation remains unverified. A preview URL alone does not establish isolation. Do not perform preview CMS writes against production. Exact executed results belong in the current PR evidence.
