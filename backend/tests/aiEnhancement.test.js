const test = require('node:test');
const assert = require('node:assert/strict');

const {
  safeParseJson,
  mergeAiIntoBaseline,
  buildAiEnhancedResponse,
} = require('../controllers/careerTools/aiEnhancement');

test('safeParseJson returns parsed object and null for invalid payload', () => {
  assert.deepEqual(safeParseJson('{"ok":true}'), { ok: true });
  assert.equal(safeParseJson('not-json'), null);
  assert.equal(safeParseJson(''), null);
});

test('mergeAiIntoBaseline preserves baseline fields while adding AI keys', () => {
  const baseline = {
    score: 82,
    nested: { a: 1, b: 2 },
    list: ['x'],
  };
  const aiPayload = {
    score: 99,
    nested: { a: 9, c: 3 },
    list: ['y'],
    advice: ['do this'],
  };

  const merged = mergeAiIntoBaseline(baseline, aiPayload);

  assert.equal(merged.score, 82);
  assert.deepEqual(merged.nested, { a: 1, b: 2, c: 3 });
  assert.deepEqual(merged.list, ['x']);
  assert.deepEqual(merged.advice, ['do this']);
});

test('buildAiEnhancedResponse returns api_key_missing when no key is configured', async () => {
  delete process.env.OPENAI_API_KEY;

  const response = await buildAiEnhancedResponse({
    toolName: 'test_tool',
    input: { foo: 'bar' },
    baselineResponse: { base: true },
  });

  assert.equal(response.base, true);
  assert.equal(response.aiEnhancementStatus, 'api_key_missing');
});
