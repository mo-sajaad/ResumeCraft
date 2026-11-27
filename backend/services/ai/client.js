require('../../config/testRun');
const OpenAI = require('openai');
const { readIntegerEnv } = require('../../config/env');
const { reserveGlobalAiRequest } = require('../../middleware/aiAbuseProtection');

const DEFAULT_MODEL = process.env.OPENAI_CAREER_LAB_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = readIntegerEnv('OPENAI_REQUEST_TIMEOUT_MS', 12000);
// 0 is valid for these two: no retries, or retries without a pause.
const MAX_RETRIES = readIntegerEnv('OPENAI_MAX_RETRIES', 2, { min: 0 });
const RETRY_BASE_DELAY_MS = readIntegerEnv('OPENAI_RETRY_BASE_DELAY_MS', 300, { min: 0 });

let cachedClient;

function getOpenAIClient() {
  if (cachedClient !== undefined) return cachedClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    cachedClient = null;
    return cachedClient;
  }

  // Retries happen only in createChatCompletion; SDK retries would multiply them (PLATFORM-007).
  cachedClient = new OpenAI({ apiKey, maxRetries: 0 });
  return cachedClient;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const code = String(error?.code || '').toLowerCase();
  // An exhausted quota does not recover on retry.
  if (code === 'insufficient_quota') return false;

  const status = error?.status || error?.statusCode;
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;

  const causeCode = String(error?.cause?.code || '').toLowerCase();
  if ([code, causeCode].some((value) => ['etimedout', 'econnreset', 'eai_again', 'abort_err'].includes(value))) {
    return true;
  }

  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout')
    || message.includes('timed out')
    || message.includes('connection error')
    || message.includes('temporarily unavailable');
}

async function createChatCompletion({
  messages,
  model = DEFAULT_MODEL,
  temperature = 0.2,
  responseFormat,
}) {
  const client = getOpenAIClient();
  if (!client) {
    const error = new Error('OPENAI_API_KEY missing');
    error.code = 'api_key_missing';
    throw error;
  }

  // One slot of the shared daily cap per completion, retries included.
  await reserveGlobalAiRequest();

  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create({
        model,
        temperature,
        messages,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      },
      {
        signal: controller.signal,
        maxRetries: 0,
      });

      clearTimeout(timeout);
      return completion;
    } catch (error) {
      clearTimeout(timeout);

      // Our own timeout aborts the request; the SDK reports that as a plain abort.
      if (attempt >= MAX_RETRIES || !(timedOut || isRetryableError(error))) {
        throw error;
      }

      const delayMs = RETRY_BASE_DELAY_MS * (2 ** attempt);
      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw new Error('OpenAI retry attempts exhausted');
}

module.exports = {
  getOpenAIClient,
  createChatCompletion,
};
