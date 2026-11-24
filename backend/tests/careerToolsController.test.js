const test = require('node:test');
const assert = require('node:assert/strict');

// Clears OPENAI_API_KEY and blocks outside connections, however this file is run.
require('./support/isolate');

// The handlers share this stand-in, so no test here can reach the OpenAI SDK
// even if a key is set later (CAREER-015).
let completionCalls = 0;
const clientPath = require.resolve('../services/ai/client');
require.cache[clientPath] = {
  id: clientPath,
  filename: clientPath,
  loaded: true,
  exports: {
    getOpenAIClient: () => null,
    createChatCompletion: async () => {
      completionCalls += 1;
      throw new Error('Tests must not request an AI completion');
    },
  },
};

const {
  analyzeAts,
  roleFitAnalysis,
  interviewPrep,
} = require('../modules/career-intelligence/controllers/careerToolsController');

test.beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  completionCalls = 0;
});

test.afterEach(() => {
  assert.equal(completionCalls, 0);
});

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('analyzeAts returns scores and recommendations', async () => {
  const req = {
    body: {
      resumeText: 'Built backend services in Node and PostgreSQL. Improved latency by 40%.',
      jobDescription: 'Looking for backend engineer with node, sql, postgresql, aws and docker.',
    },
  };
  const res = createRes();
  const next = (err) => { throw err; };

  await analyzeAts(req, res, next);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.aiEnhancementStatus, 'api_key_missing');
  assert.equal(typeof res.body.atsScore, 'number');
  assert.equal(typeof res.body.impactScore, 'number');
  assert.ok(Array.isArray(res.body.recommendations));
});

test('roleFitAnalysis requires resumeText and targetRole', async () => {
  const req = { body: { resumeText: '', targetRole: '' } };
  const res = createRes();

  await roleFitAnalysis(req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'resumeText and targetRole are required.');
});

test('roleFitAnalysis returns improved scoring fields', async () => {
  const req = {
    body: {
      resumeText: 'Built backend APIs with Node, Express, SQL and Docker. Reduced costs by 25%.',
      targetRole: 'Senior Backend Engineer',
    },
  };
  const res = createRes();

  await roleFitAnalysis(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.aiEnhancementStatus, 'api_key_missing');
  assert.equal(typeof res.body.roleFitScore, 'number');
  assert.equal(typeof res.body.roleMatchPercent, 'number');
  assert.equal(typeof res.body.quantifiedImpactScore, 'number');
});

test('interviewPrep returns coaching priorities and grading', async () => {
  const req = {
    body: {
      resumeText: 'Developed React and Node features with measurable outcomes 30% faster.',
      jobDescription: 'Need react, node, testing and communication.',
      answerText: 'Situation task action result. Improved release speed by 20%.',
    },
  };
  const res = createRes();

  await interviewPrep(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.aiEnhancementStatus, 'api_key_missing');
  assert.ok(['strong', 'average', 'weak', 'not_provided'].includes(res.body.answerGrading));
  assert.ok(Array.isArray(res.body.coachingPriorities));
  assert.ok(Array.isArray(res.body.interviewQuestions));
});

test('handlers return the same baseline and never request a completion when a key is set', async (t) => {
  const connect = t.mock.method(require('node:net').Socket.prototype, 'connect', () => {
    throw new Error('Tests must not open connections');
  });
  const body = {
    resumeText: 'Built backend APIs with Node, Express, SQL and Docker. Reduced costs by 25%.',
    jobDescription: 'Looking for backend engineer with node, sql, postgresql, aws and docker.',
    targetRole: 'Senior Backend Engineer',
  };

  for (const handler of [analyzeAts, roleFitAnalysis, interviewPrep]) {
    delete process.env.OPENAI_API_KEY;
    const withoutKey = createRes();
    await handler({ body }, withoutKey, (err) => { throw err; });

    process.env.OPENAI_API_KEY = 'synthetic-key';
    const withKey = createRes();
    await handler({ body }, withKey, (err) => { throw err; });

    assert.equal(withoutKey.statusCode, 200);
    assert.deepEqual(withKey.body, withoutKey.body);
  }
  assert.equal(connect.mock.callCount(), 0);
  // The SDK itself must never have been loaded.
  assert.equal(require.resolve('openai') in require.cache, false);
});
