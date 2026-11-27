// PLATFORM-004 and CAREER-010: on every career-tool route the per-user AI
// limiter runs only after auth, the plan check and the input guards, so
// rejected requests are never counted. Plan tiers must match the frontend's
// Career Lab catalogue (CLAUDE.md: change them together).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

require("./support/isolate");

const careerToolsRouter = require("../routes/careerToolsRoutes");
const authenticateJWT = require("../middleware/authMiddleware");
const attachPlan = require("../middleware/attachPlan");
const {
  aiRequestRateLimiter,
  careerToolInputGuard,
  enforceMaxBulletCount,
} = require("../middleware/aiAbuseProtection");
const controllers = require("../controllers/careerToolsController");

const FRONTEND_TOOLS = path.resolve(
  __dirname,
  "../../frontend/src/pages/dashboard/career-lab/careerLabTools.js",
);
const RANKS = ["free", "premium", "pro"];

function routes() {
  return careerToolsRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, stack: layer.route.stack.map((s) => s.handle) }));
}

function call(handle, plan) {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;
  handle({ plan, body: {} }, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test("there are 19 career-tool POST routes", () => {
  const all = careerToolsRouter.stack.filter((layer) => layer.route);
  assert.equal(all.length, 19);
  for (const layer of all) assert.deepEqual(Object.keys(layer.route.methods), ["post"]);
});

test("each route runs auth, attachPlan, plan check, [feature], input guard, bullet limit, limiter, controller", () => {
  const controllerFns = new Set(Object.values(controllers));

  for (const { path: routePath, stack } of routes()) {
    assert.equal(stack[0], authenticateJWT, `${routePath}: auth first`);
    assert.equal(stack[1], attachPlan, `${routePath}: attachPlan second`);

    // Index 2 is the plan check: it rejects a request with no known plan.
    const planCheck = call(stack[2], { code: "unknown-plan" });
    assert.equal(planCheck.res.statusCode, 403, `${routePath}: index 2 is a plan check`);
    assert.match(planCheck.res.body.error, /^Upgrade to /);

    const tail = stack.slice(-4);
    assert.deepEqual(
      tail.slice(0, 3),
      [careerToolInputGuard, enforceMaxBulletCount, aiRequestRateLimiter],
      `${routePath}: input guard, bullet limit, then limiter`,
    );
    assert.ok(controllerFns.has(tail[3]), `${routePath}: ends with its controller`);

    // Anything between the plan check and the input guard is a feature check.
    const middle = stack.slice(3, -4);
    assert.ok(middle.length <= 1, `${routePath}: unexpected middleware`);
    for (const handle of middle) {
      const result = call(handle, { code: "pro" });
      assert.equal(result.res.statusCode, 403, `${routePath}: feature check rejects a plan without the feature`);
      assert.equal(stack.indexOf(aiRequestRateLimiter) > stack.indexOf(handle), true);
    }

    assert.equal(stack.filter((h) => h === aiRequestRateLimiter).length, 1, `${routePath}: one limiter`);
  }
});

test("backend plan tiers match the frontend Career Lab catalogue", async () => {
  const { CAREER_LAB_TOOLS } = await import(pathToFileURL(FRONTEND_TOOLS).href);
  const frontendTiers = new Map(
    CAREER_LAB_TOOLS.map((tool) => [tool.endpoint.replace(/^\/api\/career-tools/, ""), tool.minimumPlan]),
  );
  const backend = routes();

  assert.deepEqual(
    [...frontendTiers.keys()].sort(),
    backend.map((route) => route.path).sort(),
    "the same set of career-tool endpoints",
  );

  for (const { path: routePath, stack } of backend) {
    const tier = frontendTiers.get(routePath);
    const rank = RANKS.indexOf(tier);
    assert.notEqual(rank, -1, `${routePath}: frontend tier ${tier} is known`);

    for (const [index, code] of RANKS.entries()) {
      const result = call(stack[2], { code, has_resume_analysis: true });
      if (index < rank) {
        assert.equal(result.res.statusCode, 403, `${routePath}: ${code} below ${tier} is rejected`);
        assert.equal(result.res.body.error, `Upgrade to ${tier} to access this feature.`);
      } else {
        assert.equal(result.nextCalled, true, `${routePath}: ${code} meets ${tier}`);
      }
    }
  }
});
