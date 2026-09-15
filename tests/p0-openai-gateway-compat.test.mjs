import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const load = typescriptLoader(root, { 'server-only': {} });
const openAi = load('src/lib/openAiServer.ts');

test('Netlify AI Gateway uses its documented OpenAI Chat Completions boundary', () => {
  const previous = process.env.OPENAI_BASE_URL;
  try {
    process.env.OPENAI_BASE_URL = 'https://gateway.example.test/team/site';
    assert.equal(
      openAi.openAiApiUrl('chat/completions'),
      'https://gateway.example.test/team/site/v1/chat/completions',
    );
  } finally {
    if (previous === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous;
  }
});

test('Chat Completions text and token usage are normalized for governed callers', () => {
  const payload = {
    choices: [{ message: { content: '{"safe":true}' } }],
    usage: { prompt_tokens: 21, completion_tokens: 8, total_tokens: 29 },
  };
  assert.equal(openAi.openAiChatCompletionText(payload), '{"safe":true}');
  const usage = openAi.openAiChatCompletionUsage(payload);
  assert.equal(usage.input_tokens, 21);
  assert.equal(usage.output_tokens, 8);
  assert.throws(
    () => openAi.openAiChatCompletionText({ choices: [{ message: { content: '' } }] }),
    /OPENAI_CHAT_COMPLETION_EMPTY/,
  );
});

test('every reviewed OpenAI text-generation adapter avoids the unsupported Responses route', () => {
  for (const path of [
    'src/lib/beautyConciergeServer.ts',
    'src/lib/gcAssistantPlanningServer.ts',
    'src/lib/aiAutomationServer.ts',
    'src/lib/salonDescriptionDraftServer.ts',
  ]) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /openAiApiUrl\("chat\/completions"\)/, path);
    assert.doesNotMatch(source, /openAiApiUrl\("responses"\)/, path);
  }
});
