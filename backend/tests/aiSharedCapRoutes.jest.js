// PLATFORM-004 and CAREER-010: the shared daily AI cap through the real app.
// It is reserved only for real OpenAI calls: invalid bodies and plan rejections
// never use it. At the cap a Career Lab tool still answers 200 with its no-AI
// baseline and no OpenAI call, and the resume and cover-letter AI routes answer 429.
// Synthetic database, subscriptions, document storage and OpenAI; no Redis.
delete process.env.LOG_LEVEL;
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_RETRY_BASE_DELAY_MS = '0';
process.env.MAX_GLOBAL_AI_REQUESTS_PER_DAY = '2';
// Per-user daily limit then defaults to 1, so every request uses its own user.

const mockCreate = jest.fn();
const mockPlans = new Map();

jest.mock('pino', () => require('./support/adminHarness').createCapturePino(jest.requireActual('pino')));
jest.mock('../config/db', () => require('./support/adminHarness').createFakeDb());
jest.mock('../firebaseAdmin', () => ({ auth: () => ({ verifyIdToken: jest.fn() }) }));
jest.mock('openai', () => jest.fn(() => ({ chat: { completions: { create: (...args) => mockCreate(...args) } } })));
jest.mock('../services/subscriptionService', () => ({
  getActiveSubscription: async (userId) => mockPlans.get(userId) || null,
  checkLimit: async () => ({ allowed: true }),
  trackUsage: async () => {},
  getLatestStripeCustomerId: async () => null,
}));
jest.mock('../modules/documents/services/resumeService', () => ({
  createResume: async () => ({ id: 'synthetic-resume' }),
}));
jest.mock('../modules/documents/services/coverLetterService', () => ({
  createCoverLetter: async () => ({ id: 'synthetic-cover-letter' }),
}));

const { createApp } = require('../app');
const db = require('../config/db');
const { sessionCookie, startServer } = require('./support/adminHarness');

const CAP_MESSAGE = 'The shared daily AI usage limit has been reached. Please try again later.';
const PREMIUM = { code: 'premium', has_resume_analysis: true, has_advanced_ai: true };
const FREE = { code: 'free' };
const JOB = 'Senior backend engineer. Must know node, express and postgresql. Build microservices.';
const RESUME_BODY = { personal: { fullName: 'Synthetic Person', email: 'synthetic@example.test' } };
const COVER_LETTER_BODY = { job: { company: 'Example Co', position: 'Engineer' } };

let server;
let nextUser = 0;

function newUser(plan = PREMIUM) {
  nextUser += 1;
  const id = `cap-user-${nextUser}`;
  db.addUser({ id, firebaseUid: `uid-${id}` });
  mockPlans.set(id, plan);
  return `uid-${id}`;
}

function post(path, body, plan) {
  return server.request('POST', path, {
    headers: { cookie: sessionCookie(newUser(plan)) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  server = await startServer(createApp());
});
afterAll(() => server.close());

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockImplementation(async ({ messages }) => {
    const system = messages[0].content;
    const content = /strict JSON/.test(system)
      ? JSON.stringify({ requiredSkills: ['node'], preferredSkills: [], responsibilities: ['Build services'] })
      : JSON.stringify({ summary: 'Synthetic summary', body: 'Synthetic body' });
    return { choices: [{ message: { content } }] };
  });
});

// One test: the cap is process-wide state, so the steps must run in this order.
it('rejected requests never reserve the cap; at the cap Career Lab degrades and document AI routes answer 429', async () => {
  // 1. Requests that never reach OpenAI.
  const emptyBody = await post('/api/career-tools/job-parser', {});
  expect(emptyBody.status).toBe(400);

  const tooLarge = await post('/api/career-tools/job-parser', { jobDescription: 'x'.repeat(10_001) });
  expect(tooLarge.status).toBe(400);

  const freeOnPremiumTool = await post('/api/career-tools/role-fit', { resumeText: 'r', targetRole: 'Engineer' }, FREE);
  expect(freeOnPremiumTool.status).toBe(403);

  const freeOnResumeAi = await post('/api/ai/generate-resume', RESUME_BODY, FREE);
  expect(freeOnResumeAi.status).toBe(403);

  const invalidResume = await post('/api/ai/generate-resume', { personal: { fullName: '' } });
  expect(invalidResume.status).toBe(400);

  const invalidCoverLetter = await post('/api/ai/generate-cover-letter', { job: {} });
  expect(invalidCoverLetter.status).toBe(400);

  expect(mockCreate).not.toHaveBeenCalled();

  // 2. Both slots of the cap (2) are still free.
  const enhanced = await post('/api/career-tools/job-parser', { jobDescription: JOB });
  expect(enhanced.status).toBe(200);
  expect(enhanced.json()).toMatchObject({ aiEnhancementStatus: 'enhanced', requiredSkills: ['node'] });

  const resume = await post('/api/ai/generate-resume', RESUME_BODY);
  expect(resume.status).toBe(201);
  expect(mockCreate).toHaveBeenCalledTimes(2);

  // 3. At the cap.
  const baseline = await post('/api/career-tools/job-parser', { jobDescription: JOB });
  expect(baseline.status).toBe(200);
  const baselineBody = baseline.json();
  // The AI step did not run. Provider error fields are not asserted: PLATFORM-006
  // removes them from responses. The cap error itself (429, ai_daily_limit_reached)
  // is covered at unit level in aiUsageCutoff.test.js and aiClientRetries.jest.js.
  expect(typeof baselineBody.aiEnhancementStatus).toBe('string');
  expect(baselineBody.aiEnhancementStatus).not.toBe('enhanced');
  expect(mockCreate).toHaveBeenCalledTimes(2);
  // The no-AI baseline from the job description, not the mocked AI output.
  expect(baselineBody.requiredSkills).toEqual(expect.arrayContaining(['node']));
  expect(baselineBody.requiredSkills.length + baselineBody.preferredSkills.length).toBeGreaterThan(1);
  expect(Array.isArray(baselineBody.responsibilities)).toBe(true);
  expect(baselineBody.responsibilities).not.toEqual(['Build services']);

  const cappedResume = await post('/api/ai/generate-resume', RESUME_BODY);
  expect(cappedResume.status).toBe(429);
  expect(cappedResume.json()).toEqual({ message: CAP_MESSAGE });

  const cappedCoverLetter = await post('/api/ai/generate-cover-letter', COVER_LETTER_BODY);
  expect(cappedCoverLetter.status).toBe(429);
  expect(cappedCoverLetter.json()).toEqual({ message: CAP_MESSAGE });

  expect(mockCreate).toHaveBeenCalledTimes(2);
});
