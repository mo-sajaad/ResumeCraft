const { createRateLimiter } = require('./rateLimiter');

const MAX_TEXT_INPUT_CHARS = 10000;
const MAX_RESUME_TEXT_CHARS = 20000;
const MAX_RESUME_TOTAL_CHARS = 50000;
const MAX_BULLET_COUNT = 120;
const MAX_AI_REQUESTS_PER_MINUTE = Number(process.env.MAX_AI_REQUESTS_PER_MINUTE || 30);

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

const aiRequestRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: MAX_AI_REQUESTS_PER_MINUTE,
  keyGenerator: (req) => `ai:${req.user?.id || req.ip}`,
});

const careerToolInputGuard = createInputSizeGuard({
  fields: ['jobDescription', 'resumeText', 'benchmarkText', 'answerText', 'targetRole', 'location', 'targetLocation'],
});

const workspaceRewriteInputGuard = createInputSizeGuard({
  fields: ['text', 'prompt', 'currentText', 'instruction'],
});

module.exports = {
  aiRequestRateLimiter,
  careerToolInputGuard,
  workspaceRewriteInputGuard,
  enforceMaxBulletCount,
  enforceResumePayloadLength,
  MAX_AI_REQUESTS_PER_MINUTE,
  MAX_TEXT_INPUT_CHARS,
  MAX_BULLET_COUNT,
  MAX_RESUME_TEXT_CHARS,
};
