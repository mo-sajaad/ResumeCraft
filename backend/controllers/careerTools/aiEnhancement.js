const { z } = require('zod');
const { createChatCompletion, getOpenAIClient } = require('../../services/ai/client');

const AI_MODEL = process.env.OPENAI_CAREER_LAB_MODEL || 'gpt-4o-mini';

function safeParseJson(value) {
  const parsed = z.string().min(1).safeParse(value);
  if (!parsed.success) return null;

  try {
    const obj = JSON.parse(parsed.data);
    const objectSchema = z.record(z.string(), z.unknown());
    const validated = objectSchema.safeParse(obj);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildResponseSchema(requiredKeys = [], baselineResponse = {}) {
  return z.record(z.string(), z.unknown()).superRefine((obj, ctx) => {
    requiredKeys.forEach((key) => {
      if (obj[key] === undefined || obj[key] === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required`,
        });
        return;
      }

      if (baselineResponse[key] !== undefined && baselineResponse[key] !== null) {
        const expectedType = Array.isArray(baselineResponse[key]) ? 'array' : typeof baselineResponse[key];
        const actualType = Array.isArray(obj[key]) ? 'array' : typeof obj[key];
        if (expectedType !== actualType) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} should be ${expectedType}`,
          });
        }
      }
    });
  });
}

function aiOverridesBaseline(baseline, aiPayload) {
  if (!isPlainObject(aiPayload)) return { ...baseline };

  const merge = (baseValue, aiValue) => {
    if (Array.isArray(aiValue)) return aiValue;
    if (!isPlainObject(aiValue)) return aiValue;

    const baseObject = isPlainObject(baseValue) ? baseValue : {};
    const merged = { ...baseObject };

    Object.entries(aiValue).forEach(([key, value]) => {
      merged[key] = merge(baseObject[key], value);
    });

    return merged;
  };

  return merge(baseline, aiPayload);
}

function buildPrompt({ toolName, input, baseline, outputRequirements }) {
  return [
    'You are a principal-level career strategist and recruiter advisor.',
    `Tool: ${toolName}`,
    'Return strict JSON only.',
    'Produce a complete response object that improves on BASELINE while remaining practical and specific.',
    'Do not include markdown fences or commentary outside JSON.',
    outputRequirements ? `Output requirements:\n${outputRequirements}` : null,
    `INPUT:\n${JSON.stringify(input)}`,
    `BASELINE:\n${JSON.stringify(baseline)}`,
  ].filter(Boolean).join('\n\n');
}

async function buildAiEnhancedResponse({
  toolName,
  input,
  baselineResponse,
  requiredKeys = [],
  outputRequirements = '',
}) {
  const client = getOpenAIClient();

  if (!client) {
    return {
      ...baselineResponse,
      aiEnhancementStatus: 'api_key_missing',
    };
  }

  try {
    const completion = await createChatCompletion({
      model: AI_MODEL,
      temperature: 0.2,
      responseFormat: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return strict JSON only. Be concise, specific, and actionable.',
        },
        {
          role: 'user',
          content: buildPrompt({
            toolName,
            input,
            baseline: baselineResponse,
            outputRequirements,
          }),
        },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content;
    const parsed = safeParseJson(content);
    const schema = buildResponseSchema(requiredKeys, baselineResponse);

    if (!parsed || !schema.safeParse(parsed).success) {
      return {
        ...baselineResponse,
        aiEnhancementStatus: 'invalid_ai_json',
      };
    }

    return {
      ...aiOverridesBaseline(baselineResponse, parsed),
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
  aiOverridesBaseline,
  buildAiEnhancedResponse,
};
