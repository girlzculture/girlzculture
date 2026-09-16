import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

function harness() {
  const slots = [], pending = [], instances = [], timers = new Map();
  let cursor = 0, value = '', locale = 'en', disabled = false, timerId = 0;
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(effect, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((entry, index) => entry !== old.deps[index])) {
        slots[i] = { deps, cleanup: old?.cleanup };
        pending.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  class Speech {
    constructor() { instances.push(this); }
    start() { this.started = true; }
    stop() { this.stopped = true; this.onend?.(); }
    abort() { this.aborted = true; this.onend?.(); }
  }
  const Component = typescriptLoader(process.cwd(), {
    react, 'lucide-react': { Mic: 'i' },
    '@/components/i18n/LocaleProvider': { useI18n: () => ({ locale, translateSource: text => text }) },
  }, {
    window: { SpeechRecognition: Speech },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  })('src/components/owner/AssistantDictation.tsx').default;
  function render() { cursor = 0; const tree = Component({ disabled, sessionKey: 1, value, onChange: next => { value = next; } }); pending.splice(0).forEach(effect => effect()); return tree; }
  function mic() { return render().props.children[0]; }
  return {
    instances, timers, render, mic, text: () => value,
    edit(next) { value = next; render(); },
    setLocale(next) { locale = next; render(); },
    disable() { disabled = true; render(); },
    hear(text, final = false) { instances.at(-1).onresult({ results: [{ 0: { transcript: text }, isFinal: final }] }); render(); },
  };
}

test('live dictation stays editable and a late speech event cannot overwrite a keyboard correction', () => {
  const app = harness(); app.mic().props.onClick(); app.hear('Please change my service');
  assert.equal(app.text(), 'Please change my service');
  const staleResult = app.instances[0].onresult;
  app.edit('Please change my description');
  assert.equal(app.instances[0].aborted, true);
  staleResult({ results: [{ 0: { transcript: 'stale words' }, isFinal: true }] });
  assert.equal(app.text(), 'Please change my description');
  assert.equal(app.mic().props['aria-pressed'], false);
  app.mic().props.onClick(); app.hear('tomorrow', true);
  assert.equal(app.text(), 'Please change my description tomorrow');
});

test('the ten-minute timer stops capture without submitting or erasing the transcript', () => {
  const app = harness(); app.mic().props.onClick(); app.hear('My completed transcript');
  const timeout = [...app.timers.values()].find(timer => timer.delay === 600_000);
  assert.ok(timeout);
  timeout.callback();
  assert.equal(app.instances[0].stopped, true);
  assert.equal(app.text(), 'My completed transcript');
  assert.equal(app.mic().props['aria-pressed'], false);
});

test('disabling the composer or switching language aborts the old recognizer', () => {
  const app = harness(); app.mic().props.onClick(); app.hear('Hello');
  const stale = app.instances[0].onresult;
  app.setLocale('fr');
  assert.equal(app.instances[0].aborted, true);
  assert.equal(app.mic().props['aria-pressed'], false);
  stale({ results: [{ 0: { transcript: 'must not return' }, isFinal: false }] });
  assert.equal(app.text(), 'Hello');
  app.mic().props.onClick();
  assert.equal(app.instances[1].lang, 'fr-FR');
  app.disable();
  assert.equal(app.instances[1].aborted, true);
  assert.equal(app.mic().props.disabled, true);
});

test('the message limit stops capture and reports the limit instead of silently discarding continued speech', () => {
  const app = harness(); app.mic().props.onClick();
  const lateResult = app.instances[0].onresult;
  app.hear('a'.repeat(2401));
  assert.equal(app.text().length, 2400);
  assert.equal(app.instances[0].aborted, true);
  assert.equal(app.mic().props['aria-pressed'], false);
  assert.match(app.render().props.children[1].props.children, /message limit was reached/);
  lateResult({ results: [{ 0: { transcript: 'late speech' }, isFinal: true }] });
  assert.equal(app.text(), 'a'.repeat(2400));
  app.mic().props.onClick();
  assert.equal(app.instances.length, 1);
  app.edit('A shorter reviewed request');
  app.mic().props.onClick(); app.hear('with another detail');
  assert.equal(app.text(), 'A shorter reviewed request with another detail');
});
