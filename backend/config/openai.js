const OpenAI = require('openai');

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

module.exports = {
  getOpenAIClient,
};
