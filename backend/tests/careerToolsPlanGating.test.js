const test = require("node:test");
const assert = require("node:assert/strict");

// Clears REDIS_URL and replaces DATABASE_URL, however this file is run.
require("./support/isolate");

// Counted from before the router loads, because Redis connects at load time.
const net = require("node:net");
const originalConnect = net.Socket.prototype.connect;
let connectionAttempts = 0;
net.Socket.prototype.connect = function countedConnect(...args) {
  connectionAttempts += 1;
  return originalConnect.apply(this, args);
};
test.after(() => {
  net.Socket.prototype.connect = originalConnect;
});

const careerToolsRouter = require("../routes/careerToolsRoutes");

function runPlanGate(path, plan) {
  const route = careerToolsRouter.stack.find(
    (layer) => layer.route?.path === path,
  )?.route;
  assert.ok(route, `Expected route ${path} to exist`);

  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  route.stack[2].handle({ plan }, response, () => {
    nextCalled = true;
  });

  return { response, nextCalled };
}

test("Pro career tools reject Premium and allow Pro plans", () => {
  for (const path of [
    "/recruiter-scan",
    "/competitive-analysis",
    "/salary-estimate",
    "/market-demand",
  ]) {
    const premiumResult = runPlanGate(path, { code: "premium" });
    assert.equal(
      premiumResult.response.statusCode,
      403,
      `${path} should reject Premium`,
    );
    assert.match(premiumResult.response.body.error, /Upgrade to pro/);

    const proResult = runPlanGate(path, { code: "pro" });
    assert.equal(proResult.nextCalled, true, `${path} should allow Pro`);
  }
});

test("Free tools allow all tiers and Premium tools reject Free", () => {
  for (const path of ["/job-parser", "/ats-analysis"]) {
    for (const code of ["free", "premium", "pro"]) {
      const result = runPlanGate(path, { code });
      assert.equal(result.nextCalled, true, `${path} should allow ${code}`);
    }
  }

  for (const path of [
    "/role-fit",
    "/learning-roadmap",
    "/visa-guidance",
    "/application-readiness",
    "/networking-strategy",
    "/portfolio-audit",
    "/offer-negotiation",
    "/job-search-sprint",
    "/personal-brand-audit",
    "/career-pivot-plan",
    "/outreach-messages",
    "/interview-prep",
    "/interview-drill-plan",
  ]) {
    const freeResult = runPlanGate(path, { code: "free" });
    assert.equal(
      freeResult.response.statusCode,
      403,
      `${path} should reject Free`,
    );

    for (const code of ["premium", "pro"]) {
      const paidResult = runPlanGate(path, {
        code,
        has_resume_analysis: true,
      });
      assert.equal(paidResult.nextCalled, true, `${path} should allow ${code}`);
    }
  }
});

test("unknown plans fail closed on plan-gated routes", () => {
  const result = runPlanGate("/recruiter-scan", { code: "custom" });

  assert.equal(result.response.statusCode, 403);
});

test("loading and running the plan gates opens no Redis or database connection", async () => {
  runPlanGate("/recruiter-scan", { code: "pro" });
  // A client that connects does so on a later turn of the event loop.
  await new Promise((resolve) => setImmediate(resolve));

  // Closed first so that a failure is reported instead of hanging the run.
  const redisClient = require("../config/redis").getRedisClient();
  if (redisClient) await redisClient.disconnect().catch(() => {});

  // Compared as a boolean: formatting a whole client for a diff is very slow.
  assert.equal(redisClient === null, true, "a Redis client was created");
  assert.equal(require("../config/db").totalCount, 0);
  assert.equal(connectionAttempts, 0);
});
