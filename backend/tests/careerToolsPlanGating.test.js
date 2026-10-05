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
