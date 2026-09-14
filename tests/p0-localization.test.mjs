import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load = typescriptLoader(fileURLToPath(new URL('../', import.meta.url)));
const { resolveSourceTranslation, interpolateInterfaceValues } = load('src/lib/localizationCore.ts');
const { P0_OWNER_TRANSLATION_ROWS } = load('src/i18n/p0-owner-source-catalog.ts');
const { DASHBOARD_SOURCE_MESSAGES } = load('src/i18n/dashboard-source-catalog.ts');
const { ownerResponseError } = load('src/lib/ownerActionError.ts');

test('authored P0 interface rows cover all four non-English locales without placeholder loss', () => {
  const sources = new Set();
  for (const row of P0_OWNER_TRANSLATION_ROWS) {
    assert.equal(sources.has(row[0]), false, `Duplicate translation: ${row[0]}`); sources.add(row[0]);
    assert.equal(row.length, 5);
    const slots = text => [...text.matchAll(/\{value\d+\}/g)].map(match => match[0]).sort().join(',');
    for (let i = 1; i < 5; i++) { assert.ok(row[i]?.trim(), `${row[0]} locale ${i}`); assert.equal(slots(row[i]), slots(row[0])); }
  }
});
test('reviewed dashboard translations still take precedence over new P0 wording', () => {
  assert.equal(DASHBOARD_SOURCE_MESSAGES.fr['Overview'], 'Vue d’ensemble');
  assert.equal(DASHBOARD_SOURCE_MESSAGES.es['Owner dashboard'], 'Panel de propietaria');
});
test('explicit interface templates translate wording while retaining original names and references', () => {
  const catalog = { 'Booking for {value0}': 'Réservation pour {value0}', 'Reference {value0}': 'Référence {value0}' };
  assert.equal(resolveSourceTranslation('Booking for Save', {}, catalog), 'Réservation pour Save');
  assert.equal(resolveSourceTranslation('Reference GC-000123', {}, catalog), 'Référence GC-000123');
  assert.equal(resolveSourceTranslation('Uncataloged owner prose $180', {}, catalog), 'Uncataloged owner prose $180');
});
test('punctuation-only templates do not absorb arbitrary user text', () => {
  assert.equal(resolveSourceTranslation('Save', {}, { '{value0}': 'Modifier {value0}' }), 'Save');
});

test('explicit interpolation cannot reinterpret placeholders inside original names or references', () => {
  assert.equal(interpolateInterfaceValues('{value0} / {value1}', { value0: 'Original {value1} $180', value1: 'GC123' }), 'Original {value1} $180 / GC123');
  assert.equal(interpolateInterfaceValues('Nom : {name}', { name: 'Save\\$&\n  ' }), 'Nom : Save\\$&\n  ');
});

test('an explicitly cataloged template retains empty optional values', () => {
  assert.equal(resolveSourceTranslation('1 active booking', {}, { '{value0} active booking{value1}': 'Réservations actives : {value0}{value1}' }), 'Réservations actives : 1');
});

test('specific interface templates win over generic prefixes regardless of catalog order', () => {
  const catalog = { 'Choose {value0}': 'Choisir {value0}', 'Choose one scheduling workspace. Appointments are shown in {value0}.': 'Les rendez-vous sont affichés selon {value0}.' };
  assert.equal(resolveSourceTranslation('Choose one scheduling workspace. Appointments are shown in America/New York.', {}, catalog), 'Les rendez-vous sont affichés selon America/New York.');
});

test('the actual availability subtitle translates fully in every owner locale and preserves its timezone', () => {
  const source = 'Choose one scheduling workspace. Appointments are shown in {value0}.';
  for (const locale of ['fr', 'wo', 'es', 'zh-CN']) {
    const catalog = DASHBOARD_SOURCE_MESSAGES[locale];
    assert.equal(resolveSourceTranslation(source.replace('{value0}', 'America/New York'), {}, catalog), catalog[source].replace('{value0}', 'America/New York'), locale);
  }
});

test('template matching leaves ambiguous adjacent values and long prose untouched', () => {
  const prose = 'a'.repeat(20_000) + ' end';
  assert.equal(resolveSourceTranslation(prose, {}, { '{value0} text {value1} end': 'Texte {value0} {value1}' }), prose);
  assert.equal(resolveSourceTranslation('Note AB.', {}, { 'Note {value0}{value1}.': 'Avis {value1}{value0}.' }), 'Note AB.');
});
test('an owner incident displays the exact protected reference without raw provider text', () => {
  const error = ownerResponseError({ code: 'MESSAGE_UNAVAILABLE', request_id: 'GC-INCIDENT-0007', error: 'private provider stack' }, 'FALLBACK');
  assert.equal(error.code, 'MESSAGE_UNAVAILABLE'); assert.equal(error.reference, 'GC-INCIDENT-0007');
  assert.equal(error.message.includes('provider'), false);
});
