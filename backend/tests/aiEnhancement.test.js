const test = require('node:test');
const assert = require('node:assert/strict');

const {
  safeParseJson,
  aiOverridesBaseline,
  buildAiEnhancedResponse,
} = require('../modules/career-intelligence/controllers/careerTools/aiEnhancement');

test('safeParseJson returns parsed object and null for invalid payload', () => {
  assert.deepEqual(safeParseJson('{"ok":true}'), { ok: true });
  assert.equal(safeParseJson('not-json'), null);
  assert.equal(safeParseJson(''), null);
});

test('aiOverridesBaseline allows AI to replace key values while retaining untouched fields', () => {
  const baseline = {
    score: 82,
    nested: { a: 1, b: 2 },
    list: ['x'],
  };
  const aiPayload = {
    score: 91,
    nested: { a: 9, c: 3 },
    list: ['y'],
    advice: ['do this'],
  };

  const merged = aiOverridesBaseline(baseline, aiPayload);

  assert.equal(merged.score, 91);
  assert.deepEqual(merged.nested, { a: 9, b: 2, c: 3 });
  assert.deepEqual(merged.list, ['y']);
  assert.deepEqual(merged.advice, ['do this']);
});

test('buildAiEnhancedResponse returns api_key_missing when no key is configured', async () => {
  delete process.env.OPENAI_API_KEY;

  const response = await buildAiEnhancedResponse({
    toolName: 'test_tool',
    input: { foo: 'bar' },
    baselineResponse: { base: true },
    requiredKeys: ['base'],
  });

  assert.equal(response.base, true);
  assert.equal(response.aiEnhancementStatus, 'api_key_missing');
});
