const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeAts,
  roleFitAnalysis,
  interviewPrep,
} = require('../modules/career-intelligence/controllers/careerToolsController');

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
  assert.ok(['strong', 'average', 'weak', 'not_provided'].includes(res.body.answerGrading));
  assert.ok(Array.isArray(res.body.coachingPriorities));
  assert.ok(Array.isArray(res.body.interviewQuestions));
});
