const { createRateCounter, createRateLimiter } = require('./rateLimiter');
const { readIntegerEnv } = require('../config/env');

const MAX_TEXT_INPUT_CHARS = 10000;
const MAX_RESUME_TEXT_CHARS = 20000;
const MAX_RESUME_TOTAL_CHARS = 50000;
const MAX_BULLET_COUNT = 120;
const MAX_AI_REQUESTS_PER_MINUTE = readIntegerEnv('MAX_AI_REQUESTS_PER_MINUTE', 30);
const MAX_GLOBAL_AI_REQUESTS_PER_DAY = readIntegerEnv('MAX_GLOBAL_AI_REQUESTS_PER_DAY', 500);
// Kept below the shared cap so one account cannot use it up (PLATFORM-004).
const MAX_PER_USER_DAILY_ALLOWED = Math.max(1, MAX_GLOBAL_AI_REQUESTS_PER_DAY - 1);
const MAX_AI_REQUESTS_PER_USER_PER_DAY = readIntegerEnv(
  'MAX_AI_REQUESTS_PER_USER_PER_DAY',
  Math.min(50, MAX_PER_USER_DAILY_ALLOWED),
);
const DAY_MS = 24 * 60 * 60 * 1000;
const GLOBAL_AI_LIMIT_MESSAGE = 'The shared daily AI usage limit has been reached. Please try again later.';

if (MAX_AI_REQUESTS_PER_USER_PER_DAY > MAX_PER_USER_DAILY_ALLOWED) {
  throw new Error('MAX_AI_REQUESTS_PER_USER_PER_DAY must be lower than MAX_GLOBAL_AI_REQUESTS_PER_DAY.');
}

function countBulletsInText(text = '') {
  if (typeof text !== 'string' || !text.trim()) return 0;

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.filter((line) => /^[-*•]/.test(line)).length;
}

function createInputSizeGuard({
  fields = [],
  textLimit = MAX_TEXT_INPUT_CHARS,
  resumeFields = ['resumeText', 'text', 'currentText'],
}) {
  return (req, res, next) => {
    const body = req.body || {};

    for (const field of fields) {
      const value = body[field];
      if (typeof value === 'string' && value.length > textLimit) {
        return res.status(400).json({ message: `${field} is too large. Maximum ${textLimit} characters.` });
      }
    }

    for (const field of resumeFields) {
      const value = body[field];
      if (typeof value === 'string' && value.length > MAX_RESUME_TEXT_CHARS) {
        return res.status(400).json({ message: `${field} exceeds max resume length (${MAX_RESUME_TEXT_CHARS} chars).` });
      }
    }

    return next();
  };
}

function enforceMaxBulletCount(req, res, next) {
  const body = req.body || {};
  const bulletSources = [];

  if (typeof body.resumeText === 'string') bulletSources.push(body.resumeText);
  if (typeof body.text === 'string') bulletSources.push(body.text);
  if (typeof body.currentText === 'string') bulletSources.push(body.currentText);

  const experience = Array.isArray(body.experience) ? body.experience : [];
  experience.forEach((item) => {
    if (Array.isArray(item?.description)) {
      bulletSources.push(item.description.join('\n'));
    } else if (typeof item?.description === 'string') {
      bulletSources.push(item.description);
    }
  });

  const totalBullets = bulletSources.reduce((count, source) => count + countBulletsInText(source), 0);

  if (totalBullets > MAX_BULLET_COUNT) {
    return res.status(400).json({ message: `Input has too many bullets. Maximum allowed is ${MAX_BULLET_COUNT}.` });
  }

  return next();
}

function enforceResumePayloadLength(req, res, next) {
  const payload = req.body || {};
  const payloadSize = JSON.stringify(payload).length;

  if (payloadSize > MAX_RESUME_TOTAL_CHARS) {
    return res.status(400).json({ message: `Resume payload is too large. Maximum allowed is ${MAX_RESUME_TOTAL_CHARS} characters.` });
  }

  return next();
}

const perUserAiRequestRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: MAX_AI_REQUESTS_PER_MINUTE,
  keyGenerator: (req) => `ai:${req.user?.id || req.ip}`,
});

const perUserDailyAiRequestRateLimiter = createRateLimiter({
  windowMs: DAY_MS,
  max: MAX_AI_REQUESTS_PER_USER_PER_DAY,
  keyGenerator: (req) => `ai:daily:${req.user?.id || req.ip}`,
  message: 'You have reached your daily AI request limit. Please try again later.',
});

// Route middleware: per-user limits only. Place it after auth, plan checks and
// input guards so rejected requests do not count.
function aiRequestRateLimiter(req, res, next) {
  return perUserAiRequestRateLimiter(req, res, (error) => {
    if (error) return next(error);
    return perUserDailyAiRequestRateLimiter(req, res, next);
  });
}

// Created on first use, so loading this module opens no counter of its own.
let consumeGlobalAiRequest;

// The shared daily cap is counted by the AI client right before a real OpenAI
// call, so invalid requests, plan rejections and runs without an API key never
// use it up (PLATFORM-004, CAREER-010). Throws a 429 error at the cap, or a 503
// error when the counter is unavailable in production.
async function reserveGlobalAiRequest() {
  consumeGlobalAiRequest ??= createRateCounter({
    windowMs: DAY_MS,
    max: MAX_GLOBAL_AI_REQUESTS_PER_DAY,
  });
  const { allowed, retryAfterSeconds } = await consumeGlobalAiRequest('ai:global:daily');
  if (allowed) return;

  const error = new Error(GLOBAL_AI_LIMIT_MESSAGE);
  error.status = 429;
  error.code = 'ai_daily_limit_reached';
  error.retryAfterSeconds = retryAfterSeconds;
  throw error;
}

const careerToolInputGuard = createInputSizeGuard({
  fields: ['jobDescription', 'resumeText', 'benchmarkText', 'answerText', 'targetRole', 'location', 'targetLocation'],
});

const workspaceRewriteInputGuard = createInputSizeGuard({
  fields: ['text', 'prompt', 'currentText', 'instruction'],
});

module.exports = {
  aiRequestRateLimiter,
  reserveGlobalAiRequest,
  careerToolInputGuard,
  workspaceRewriteInputGuard,
  enforceMaxBulletCount,
  enforceResumePayloadLength,
  MAX_AI_REQUESTS_PER_MINUTE,
  MAX_GLOBAL_AI_REQUESTS_PER_DAY,
  MAX_AI_REQUESTS_PER_USER_PER_DAY,
  MAX_TEXT_INPUT_CHARS,
  MAX_BULLET_COUNT,
  MAX_RESUME_TEXT_CHARS,
};
