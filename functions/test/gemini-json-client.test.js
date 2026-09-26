const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateGeminiJson } = require('../gemini-json-client');

const ok = payload => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: JSON.stringify(payload) }] },
    }],
  }),
});

test('falls back only after a transient provider failure', async () => {
  const called = [];
  const result = await generateGeminiJson({
    system: 'system',
    data: { value: 1 },
    apiKey: 'key',
    primaryModel: 'primary',
    secondaryModel: 'secondary',
    fetchImpl: async url => {
      called.push(url);
      if (called.length === 1) return { ok: false, status: 503, text: async () => 'temporary' };
      return ok({ answer: 'done' });
    },
  });

  assert.deepEqual(result, { answer: 'done' });
  assert.equal(called.length, 2);
  assert.match(called[0], /primary/);
  assert.match(called[1], /secondary/);
});

test('does not hide a non-transient provider contract failure', async () => {
  await assert.rejects(
    generateGeminiJson({
      system: 'system',
      data: {},
      apiKey: 'key',
      primaryModel: 'primary',
      secondaryModel: 'secondary',
      fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'bad request' }),
    }),
    error => error.code === 'failed-precondition'
  );
});

test('rejects malformed provider JSON result', async () => {
  await assert.rejects(
    generateGeminiJson({
      system: 'system',
      data: {},
      apiKey: 'key',
      primaryModel: 'primary',
      secondaryModel: 'secondary',
      fetchImpl: async () => ok({ invalid: undefined }),
    }),
    error => error.code === 'data-loss'
  );
});
