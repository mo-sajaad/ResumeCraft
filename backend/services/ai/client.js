const OpenAI = require('openai');

const DEFAULT_MODEL = process.env.OPENAI_CAREER_LAB_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 12000);
const MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES || 2);
const RETRY_BASE_DELAY_MS = Number(process.env.OPENAI_RETRY_BASE_DELAY_MS || 300);

let cachedClient;

function getOpenAIClient() {
  if (cachedClient !== undefined) return cachedClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const status = error?.status || error?.statusCode;
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;

  const code = String(error?.code || '').toLowerCase();
  if (['etimedout', 'econnreset', 'eai_again', 'abort_err'].includes(code)) return true;

  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('temporarily unavailable');
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

  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create({
        model,
        temperature,
        messages,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      },
      {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return completion;
    } catch (error) {
      clearTimeout(timeout);

      if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
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
