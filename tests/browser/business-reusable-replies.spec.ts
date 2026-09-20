import { expect, type Page, type Route } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { reusableReplyCopy } from '../../src/i18n/business-reusable-reply-copy';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { BUSINESS_MESSAGES_SOURCE_MESSAGES } from '../../src/i18n/business-messages-source-catalog';
import type { ReusableReply } from '../../src/lib/businessReusableReplies';

test.use({ serviceWorkers: 'block' });
const original = '  Bonjour !\nMerci de venir avec les cheveux démêlés. Save $180 GCABC12  ';
const replyId = '18800000-0000-4000-8000-000000000003';
async function fixture(page: Page, locale = 'en') {
 const f = await p0OwnerFixture(page, { populated: true, locale });
 const copy = (s: Parameters<typeof reusableReplyCopy>[1]) => reusableReplyCopy(locale, s);
 const t = (s: string) => BUSINESS_MESSAGES_SOURCE_MESSAGES[locale]?.[s] || DASHBOARD_SOURCE_MESSAGES[locale]?.[s] || s;
 const booking = { ...f.records.bookings[0], id: f.ids.booking, guest_name: 'Reply client', appointment_datetime: '2030-03-10T15:00:00Z', salon: f.business, style: { name: 'Saved style' }, customer_id: 'own-client', duration_hours: 2 };
 const other = { ...booking, id: '18800000-0000-4000-8000-000000000099', guest_name: 'Other reply client', customer_id: 'own-other-client' };
 const messagePosts: Record<string, unknown>[] = [], writes: Record<string, unknown>[] = [];
 const rows = new Map<string, ReusableReply>();
 const deniedConversations = new Set<string>();
 let failedSave = false;
 let freshGate: ((route: Route) => Promise<void>) | undefined;
 await page.route('**/api/messages**', route => {
  const req = route.request(), selected = new URL(req.url()).searchParams.get('booking_id');
  if (req.method() === 'GET' && selected && deniedConversations.has(selected)) return route.fulfill({ status: 403, json: { code: 'MESSAGE_FORBIDDEN', request_id: 'forbidden-conversation-reference' } });
  if (req.method() === 'GET') return route.fulfill({ json: selected ? { role: 'salon', booking: selected === other.id ? other : booking, messages: [] } : { role: 'salon', threads: [booking, other].map(row => ({ booking: row, messages: [] })) } });
  messagePosts.push(req.postDataJSON());
  return route.fulfill({ status: 503, json: { code: 'UNEXPECTED_SEND' } });
 });
 await page.route('**/api/salon/reusable-replies**', async route => {
  const req = route.request(), q = new URL(req.url()).searchParams;
  expect(q.get('business_id')).toBe(f.business.id);
  if (req.method() === 'GET') {
   if (q.has('id') && freshGate) { await freshGate(route); return; }
   const archived = q.get('archived') === 'true', offset = Number(q.get('offset') || 0), query = (q.get('query') || '').toLowerCase();
   const selected = [...rows.values()].filter(row => Boolean(row.archived_at) === archived && (!q.has('id') || row.id === q.get('id')) && `${row.title}\n${row.body}`.toLowerCase().includes(query));
   if (q.has('id') && selected.length !== 1) return route.fulfill({ status: 409, json: { code: 'REPLY_NOT_FOUND' } });
   return route.fulfill({ json: { salon_id: f.business.id, rows: selected.slice(offset, offset + 25), total: selected.length, offset, page_size: 25, archived } });
  }
  const input = req.postDataJSON(); writes.push(input);
  if (failedSave) { failedSave = false; return route.fulfill({ status: 503, json: { code: 'REPLY_UNAVAILABLE', request_id: 'reusable-reply-fixture-reference' } }); }
  const before = rows.get(input.id);
  if ((before?.revision ?? null) !== input.expected_revision || before?.archived_at) return route.fulfill({ status: 409, json: { code: 'REPLY_STALE' } });
  const row: ReusableReply = input.action === 'archive' ? { ...before!, archived_at: '2026-09-19T19:00:00Z', revision: before!.revision + 1 } : { id: input.id, salon_id: f.business.id, title: input.title, body: input.body, source_locale: input.source_locale, revision: (before?.revision || 0) + 1, archived_at: null, updated_at: '2026-09-19T19:00:00Z' };
  rows.set(row.id, row); return route.fulfill({ json: { reply: row } });
 });
 async function open() {
  await page.goto(`/salon/dashboard/messages?conversation=${f.ids.booking}`);
  const composer = page.locator('#booking-message'); await expect(composer).toBeEnabled();
  await page.getByRole('main').locator('summary').filter({ hasText: copy('Reusable replies') }).click();
  const library = page.getByRole('region', { name: copy('Reusable replies'), exact: true }); await expect(library).toBeVisible();
  await expect(library.getByRole('button', { name: copy('Refresh'), exact: true })).toBeEnabled();
  return { library, composer };
 }
 return { ...f, copy, t, rows, writes, messagePosts, open, otherId: other.id, deniedConversations, seed: () => rows.set(replyId, { id: replyId, salon_id: f.business.id, title: 'Avant votre visite', body: original, source_locale: 'fr', revision: 1, archived_at: null, updated_at: '2026-09-19T12:00:00Z' }), failSave: () => { failedSave = true; }, gate: (callback: typeof freshGate) => { freshGate = callback; } };
}

for (const [locale, width, height] of [['en', 390, 844], ['fr', 768, 900], ['es', 1440, 1000], ['zh-CN', 844, 390]] as const) {
 test(`Business reusable replies preserve original drafts through create edit archive in ${locale}`, async ({ page }, info) => {
  const f = await fixture(page, locale); await page.setViewportSize({ width, height }); const { library, composer } = await f.open(), c = f.copy;
  await library.getByRole('button', { name: c('New reply'), exact: true }).click();
  await library.getByRole('textbox', { name: c('Title'), exact: true }).fill('Avant votre visite');
  await library.getByRole('textbox', { name: c('Message'), exact: true }).fill(original);
  await library.getByRole('combobox', { name: c('Original language'), exact: true }).selectOption('fr');
  f.failSave(); await library.getByRole('button', { name: c('Save reply'), exact: true }).click();
  await expect(library.getByRole('alert')).toContainText('reusable-reply-fixture-reference');
  await expect(library.getByRole('textbox', { name: c('Message'), exact: true })).toHaveValue(original);
  await library.getByRole('button', { name: c('Save reply'), exact: true }).click(); await expect(library.getByText(c('Reply saved.'), { exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(2); expect(f.writes[0].request_id).toBe(f.writes[1].request_id); expect(f.writes[1].body).toBe(original);
  await library.getByRole('button', { name: c('Use as draft'), exact: true }).click(); await expect(composer).toHaveValue(original);
  await expect(page.getByRole('combobox', { name: f.t('Message language'), exact: true })).toHaveValue('fr'); expect(f.messagePosts).toEqual([]);
  await composer.fill('Existing unsent draft'); await library.getByRole('button', { name: c('Use as draft'), exact: true }).click();
  const confirmation = library.getByRole('group', { name: c('Replace current draft?'), exact: true }); await expect(confirmation).toBeVisible(); await expect(composer).toHaveValue('Existing unsent draft');
  await confirmation.getByRole('button', { name: c('Cancel'), exact: true }).click(); await expect(composer).toHaveValue('Existing unsent draft');
  await library.getByRole('button', { name: c('Edit reply'), exact: true }).click(); await library.getByRole('textbox', { name: c('Message'), exact: true }).fill(`${original}\nEdited original.`);
  await library.getByRole('button', { name: c('Save reply'), exact: true }).click(); await expect(library.getByText(c('Reply saved.'), { exact: true })).toBeVisible();
  await library.getByRole('button', { name: c('Use as draft'), exact: true }).click(); await confirmation.getByRole('button', { name: c('Replace draft'), exact: true }).click(); await expect(composer).toHaveValue(`${original}\nEdited original.`);
  await library.getByRole('button', { name: c('Archive reply'), exact: true }).click(); await library.getByRole('button', { name: c('Confirm archive'), exact: true }).click(); await expect(library.getByText(c('Reply archived.'), { exact: true })).toBeVisible();
  await expect(library.getByRole('button', { name: c('Use as draft'), exact: true })).toHaveCount(0); await expect(composer).toHaveValue(`${original}\nEdited original.`);
  await library.getByRole('button', { name: c('Archived replies'), exact: true }).click(); await expect(library.getByRole('heading', { name: 'Avant votre visite', exact: true })).toBeVisible();
  await expect(library.getByRole('button', { name: c('Use as draft'), exact: true })).toHaveCount(0);
  await library.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('reusable-replies-archived-original.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); expect(f.messagePosts).toEqual([]); expect(f.unexpected).toEqual([]);
 });
}

test('Business reusable replies keep stale edits through refresh and explicitly save a new copy', async ({ page }, info) => {
 const f = await fixture(page); f.seed(); const { library } = await f.open(), c = f.copy;
 await library.getByRole('button', { name: c('Edit reply'), exact: true }).click(); await library.getByRole('textbox', { name: c('Message'), exact: true }).fill('Preserved unsaved original');
 f.rows.set(replyId, { ...f.rows.get(replyId)!, revision: 2, body: 'Changed by own team member' });
 await library.getByRole('button', { name: c('Save reply'), exact: true }).click(); await expect(library.getByRole('alert')).toContainText('Your edits are preserved');
 await expect(library.getByRole('button', { name: c('Save reply'), exact: true })).toBeDisabled(); await library.getByRole('button', { name: c('Refresh'), exact: true }).click();
 await expect(library.getByText('Changed by own team member', { exact: true })).toBeVisible(); await expect(library.getByRole('textbox', { name: c('Message'), exact: true })).toHaveValue('Preserved unsaved original'); await expect(library.getByRole('button', { name: c('Save reply'), exact: true })).toBeDisabled();
 await page.screenshot({ path: info.outputPath('reusable-reply-stale-preserved.png') });
 await library.getByRole('button', { name: c('Keep edits in a new reply'), exact: true }).click(); await expect(library.getByRole('button', { name: c('Save reply'), exact: true })).toBeEnabled();
 await library.getByRole('button', { name: c('Save reply'), exact: true }).click(); await expect(library.getByText(c('Reply saved.'), { exact: true })).toBeVisible();
 expect(f.writes).toHaveLength(2); expect(f.writes[1].id).not.toBe(replyId); expect(f.writes[1].expected_revision).toBeNull(); expect(f.rows.get(replyId)?.body).toBe('Changed by own team member'); expect([...f.rows.values()].find(r => r.id !== replyId)?.body).toBe('Preserved unsaved original'); expect(f.messagePosts).toEqual([]); expect(f.unexpected).toEqual([]);
});

test('Business reusable replies refuse stale composer versions and archived replies before insertion', async ({ page }) => {
 const f = await fixture(page); f.seed(); const { library, composer } = await f.open(), c = f.copy;
 await composer.fill('Unsent draft');
 let enter!: () => void, release!: () => void; const entered = new Promise<void>(r => { enter = r; }), gate = new Promise<void>(r => { release = r; });
 f.gate(async route => { enter(); await gate; await route.fulfill({ json: { salon_id: f.business.id, rows: [f.rows.get(replyId)], total: 1, offset: 0, page_size: 25, archived: false } }); });
 await library.getByRole('button', { name: c('Use as draft'), exact: true }).click(); await entered;
 await composer.fill('Changed and restored'); await composer.fill('Unsent draft'); release();
 await expect(library.getByRole('alert')).toContainText(c('Your draft changed. Review it before choosing a reply.')); await expect(composer).toHaveValue('Unsent draft'); await expect(library.getByRole('group', { name: c('Replace current draft?'), exact: true })).toHaveCount(0);
 f.gate(undefined); await library.getByRole('button', { name: c('Use as draft'), exact: true }).click();
 const confirmation = library.getByRole('group', { name: c('Replace current draft?'), exact: true }); await expect(confirmation).toBeVisible();
 let confirmEnter!: () => void, confirmRelease!: () => void; const confirmEntered = new Promise<void>(r => { confirmEnter = r; }), confirmGate = new Promise<void>(r => { confirmRelease = r; });
 f.gate(async route => { confirmEnter(); await confirmGate; await route.fulfill({ json: { salon_id: f.business.id, rows: [f.rows.get(replyId)], total: 1, offset: 0, page_size: 25, archived: false } }); });
 await confirmation.getByRole('button', { name: c('Replace draft'), exact: true }).click(); await confirmEntered;
 await page.getByRole('combobox', { name: f.t('Message language'), exact: true }).selectOption('es'); confirmRelease();
 await expect(library.getByRole('alert')).toContainText(c('Your draft changed. Review it before choosing a reply.')); await expect(composer).toHaveValue('Unsent draft'); await confirmation.getByRole('button', { name: c('Cancel'), exact: true }).click();
 f.gate(undefined); f.rows.set(replyId, { ...f.rows.get(replyId)!, archived_at: '2026-09-19T19:00:00Z', revision: 2 }); await library.getByRole('button', { name: c('Use as draft'), exact: true }).click();
 await expect(library.getByRole('alert')).toContainText(c('Reply changed. Refresh the library before trying again.')); await expect(composer).toHaveValue('Unsent draft'); expect(f.writes).toEqual([]); expect(f.messagePosts).toEqual([]); expect(f.unexpected).toEqual([]);
});

test('Business reusable replies cannot place a pending original into a different conversation', async ({ page }) => {
 const f = await fixture(page); f.seed(); await page.setViewportSize({ width: 390, height: 844 }); const { library, composer } = await f.open(), c = f.copy;
 await composer.fill('First conversation draft');
 let enter!: () => void, release!: () => void; const entered = new Promise<void>(r => { enter = r; }), gate = new Promise<void>(r => { release = r; });
 const responseDone = page.waitForResponse(response => new URL(response.url()).pathname === '/api/salon/reusable-replies' && new URL(response.url()).searchParams.get('id') === replyId);
 f.gate(async route => { enter(); await gate; await route.fulfill({ json: { salon_id: f.business.id, rows: [f.rows.get(replyId)], total: 1, offset: 0, page_size: 25, archived: false } }); });
 await library.getByRole('button', { name: c('Use as draft'), exact: true }).click(); await entered;
 await page.getByRole('button', { name: f.t('Back to conversations'), exact: true }).click();
 await page.getByRole('button', { name: /Other reply client.*Saved style/ }).click(); await expect(page).toHaveURL(/conversation=18800000-0000-4000-8000-000000000099/); await expect(composer).toBeEnabled(); await composer.fill('Second conversation draft');
 release(); const response = await responseDone; await response.finished(); await expect(composer).toHaveValue('Second conversation draft');
 await expect(page.getByRole('group', { name: c('Replace current draft?'), exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: f.t('Back to conversations'), exact: true }).click(); await page.getByRole('button', { name: /^Reply client.*Saved style/ }).click(); await expect(composer).toHaveValue('First conversation draft');
 expect(f.messagePosts).toEqual([]); expect(f.writes).toEqual([]); expect(f.unexpected).toEqual([]);
});

test('Business reusable replies refuse insertion after the current conversation read is forbidden', async ({ page }) => {
 const f = await fixture(page); f.seed(); await page.setViewportSize({ width: 390, height: 844 }); const { composer } = await f.open(), c = f.copy;
 await composer.fill('First authorized conversation draft'); f.deniedConversations.add(f.otherId);
 await page.getByRole('button', { name: f.t('Back to conversations'), exact: true }).click(); await page.getByRole('button', { name: /Other reply client.*Saved style/ }).click();
 await expect(page.getByRole('main').getByRole('alert')).toContainText('forbidden-conversation-reference');
 const summary = page.getByRole('main').locator('summary').filter({ hasText: c('Reusable replies') });
 if (await summary.isVisible()) await summary.click();
 await expect(page.getByRole('button', { name: c('Use as draft'), exact: true }).and(page.locator(':enabled'))).toHaveCount(0);
 await expect(page.getByRole('button', { name: c('New reply'), exact: true }).and(page.locator(':enabled'))).toHaveCount(0);
 expect(f.messagePosts).toEqual([]); expect(f.writes).toEqual([]);
 f.deniedConversations.clear(); await page.reload(); await expect(composer).toBeEnabled();
 await page.getByRole('main').locator('summary').filter({ hasText: c('Reusable replies') }).click();
 await expect(page.getByRole('button', { name: c('Use as draft'), exact: true })).toBeEnabled(); expect(f.unexpected).toEqual([]);
});

test('Business reusable replies never submit a composed message from library keyboard controls', async ({ page }) => {
 const f = await fixture(page); const { library, composer } = await f.open(), c = f.copy;
 await composer.fill('Private unsent message');
 await page.evaluate(() => {
  const state = window as typeof window & { replyComposerSubmits?: number }; state.replyComposerSubmits = 0;
  document.addEventListener('submit', event => { if ((event.target as HTMLFormElement).querySelector('#booking-message')) state.replyComposerSubmits!++; }, true);
 });
 await library.getByRole('button', { name: c('New reply'), exact: true }).click(); const title = library.getByRole('textbox', { name: c('Title'), exact: true }); await title.fill('Keyboard draft'); await title.press('Enter');
 expect(await page.evaluate(() => (window as typeof window & { replyComposerSubmits?: number }).replyComposerSubmits)).toBe(0); await expect(composer).toHaveValue('Private unsent message');
 await library.getByRole('button', { name: c('Discard edits'), exact: true }).click(); const search = library.getByRole('textbox', { name: c('Search replies'), exact: true }); await search.fill('Keyboard'); await search.press('Enter');
 expect(await page.evaluate(() => (window as typeof window & { replyComposerSubmits?: number }).replyComposerSubmits)).toBe(0); await expect(composer).toHaveValue('Private unsent message');
 await library.getByRole('button', { name: c('Search'), exact: true }).click(); await expect(library.getByText(c('No reusable replies match this view.'), { exact: true })).toBeVisible();
 expect(f.messagePosts).toEqual([]); expect(f.writes).toEqual([]); expect(f.unexpected).toEqual([]);
});
