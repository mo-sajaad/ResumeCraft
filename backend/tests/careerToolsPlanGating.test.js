const test = require("node:test");
const assert = require("node:assert/strict");

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

test("Premium retains Premium-level ATS analysis", () => {
  const result = runPlanGate("/ats-analysis", {
    code: "premium",
    has_resume_analysis: true,
  });

  assert.equal(result.nextCalled, true);
});

test("unknown plans fail closed on plan-gated routes", () => {
  const result = runPlanGate("/recruiter-scan", { code: "custom" });

  assert.equal(result.response.statusCode, 403);
});
