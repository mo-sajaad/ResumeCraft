const { getOpenAIClient } = require('../../config/openai');

const AI_MODEL = process.env.OPENAI_CAREER_LAB_MODEL || 'gpt-4o-mini';

function safeParseJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mergeAiIntoBaseline(baseline, aiPayload) {
  if (!aiPayload || typeof aiPayload !== 'object' || Array.isArray(aiPayload)) {
    return { ...baseline };
  }

  const mergeRecursively = (base, ai) => {
    if (Array.isArray(base) || Array.isArray(ai)) return base;

    const merged = { ...base };
    Object.entries(ai || {}).forEach(([key, aiValue]) => {
      const baseValue = merged[key];

      if (baseValue === undefined) {
        merged[key] = aiValue;
        return;
      }

      if (
        baseValue
        && aiValue
        && typeof baseValue === 'object'
        && typeof aiValue === 'object'
        && !Array.isArray(baseValue)
        && !Array.isArray(aiValue)
      ) {
        merged[key] = mergeRecursively(baseValue, aiValue);
      }
    });

    return merged;
  };

  return mergeRecursively(baseline, aiPayload);
}

function buildPrompt({ toolName, input, baseline }) {
  return [
    'You are an expert career coach and recruiting strategist.',
    `Tool: ${toolName}`,
    'Given INPUT and BASELINE JSON, return ONLY a valid JSON object that adds high-quality refinements.',
    'Do not remove or overwrite existing BASELINE keys. Only add complementary keys.',
    'Preferred additional keys: executiveSummary (string), priorityActions (string[]), risks (string[]), confidenceRationale (string).',
    `INPUT:\n${JSON.stringify(input)}`,
    `BASELINE:\n${JSON.stringify(baseline)}`,
  ].join('\n\n');
}

async function buildAiEnhancedResponse({ toolName, input, baselineResponse }) {
  const client = getOpenAIClient();

  if (!client) {
    return {
      ...baselineResponse,
      aiEnhancementStatus: 'api_key_missing',
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return strict JSON only. No markdown, no prose outside JSON.',
        },
        {
          role: 'user',
          content: buildPrompt({ toolName, input, baseline: baselineResponse }),
        },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content;
    const parsed = safeParseJson(content);

    if (!parsed) {
      return {
        ...baselineResponse,
        aiEnhancementStatus: 'invalid_ai_json',
      };
    }

    return {
      ...mergeAiIntoBaseline(baselineResponse, parsed),
      aiEnhancementStatus: 'enhanced',
    };
  } catch {
    return {
      ...baselineResponse,
      aiEnhancementStatus: 'openai_error',
    };
  }
}

module.exports = {
  safeParseJson,
  mergeAiIntoBaseline,
  buildAiEnhancedResponse,
};
