import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const { assistantLocalVoice } = typescriptLoader(process.cwd())('src/lib/assistantSpeechCore.ts');

test('spoken answers choose an installed matching-language voice and exclude remote voices', () => {
  for (const [locale, lang] of [['en','en-US'],['fr','fr-FR'],['es','es-ES'],['wo','wo-SN'],['zh-CN','zh-CN']]) {
    const installed = { lang, localService: true };
    assert.equal(assistantLocalVoice([{ lang, localService: false }, installed], locale), installed);
    assert.equal(assistantLocalVoice([{ lang, localService: false }], locale), undefined);
  }
});

function speechHarness() {
  const slots = [], effects = [], spoken = [], calls = [];
  let cursor = 0, locale = 'fr', language = 'fr', sessionKey = 1;
  let voices = [{ lang: 'fr-FR', localService: true }, { lang: 'en-US', localService: true }];
  const target = new EventTarget();
  const synth = {
    getVoices: () => voices,
    speak: utterance => { calls.push('speak'); spoken.push(utterance); },
    cancel: () => calls.push('cancel'), pause: () => calls.push('pause'), resume: () => calls.push('resume'),
  };
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(effect, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((entry, index) => entry !== old.deps[index])) {
        slots[i] = { deps, cleanup: old?.cleanup };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  class Utterance { constructor(text) { this.text = text; } }
  const Component = typescriptLoader(process.cwd(), {
    react, '@/components/i18n/LocaleProvider': { useI18n: () => ({ locale, translateSource: text => text }) },
  }, {
    Event, SpeechSynthesisUtterance: Utterance,
    window: { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance,
      addEventListener: (...args) => target.addEventListener(...args), removeEventListener: (...args) => target.removeEventListener(...args), dispatchEvent: event => target.dispatchEvent(event) },
    fetch: () => { throw new Error('Speech must not call a paid audio API'); },
  })('src/components/owner/AssistantSpeech.tsx').default;
  function render() { cursor = 0; const tree = Component({ text: 'Bonjour', sessionKey, language }); effects.splice(0).forEach(effect => effect()); return tree; }
  function all(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => all(child, predicate));
    return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)];
  }
  return {
    calls, spoken, render,
    click(label) { const button = all(render(), node => node.type === 'button' && node.props.children === label)[0]; assert.ok(button, label); button.props.onClick(); render(); },
    notice: () => all(render(), node => node.props?.role === 'status')[0]?.props.children,
    changeLocale(next) { locale = next; render(); }, changeSession() { sessionKey++; render(); },
    unavailable() { voices = []; }, setLanguage(next) { language = next; render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('reading never autoplays, and explicit pause, resume and stop preserve the text-only path', () => {
  const app = speechHarness(); app.render(); assert.equal(app.calls.length, 0);
  app.click('Read aloud'); assert.equal(app.spoken[0].text, 'Bonjour'); assert.equal(app.spoken[0].lang, 'fr-FR');
  app.click('Pause audio'); app.click('Resume audio'); app.click('Stop audio');
  assert.deepEqual(app.calls, ['speak', 'pause', 'resume', 'cancel']);
});

test('locale, account/session changes and unmount cancel playback and invalidate late callbacks', () => {
  const app = speechHarness(); app.click('Read aloud'); const end = app.spoken[0].onend;
  app.changeLocale('en'); assert.equal(app.spoken[0].onend, null); end();
  app.click('Read aloud'); assert.equal(app.spoken[1].lang, 'fr-FR', 'old answer retains its original language');
  app.changeSession(); app.click('Read aloud'); app.unmount();
  assert.equal(app.calls.filter(call => call === 'cancel').length, 3);
});

test('missing installed voices and playback errors report a readable fallback without a provider request', () => {
  const app = speechHarness(); app.unavailable(); app.click('Read aloud');
  assert.match(app.notice(), /No on-device voice/); assert.equal(app.spoken.length, 0);
  const failed = speechHarness(); failed.click('Read aloud'); failed.spoken[0].onerror();
  assert.match(failed.notice(), /Audio stopped/);
});

test('unsupported Wolof and Simplified Chinese keep the text path instead of using a misleading voice', () => {
  const other = [{ lang: 'en-US', localService: true }, { lang: 'zh-TW', localService: true }];
  assert.equal(assistantLocalVoice(other, 'wo'), undefined);
  assert.equal(assistantLocalVoice(other, 'zh-CN'), undefined);
});
