const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

process.env.NODE_ENV = "test";
process.env.MAX_AI_REQUESTS_PER_MINUTE = "1";
process.env.MAX_GLOBAL_AI_REQUESTS_PER_DAY = "2";
process.env.MAX_AI_REQUESTS_PER_USER_PER_DAY = "1";
delete process.env.REDIS_URL;

const {
  aiRequestRateLimiter,
  reserveGlobalAiRequest,
} = require("../middleware/aiAbuseProtection");

function runLimiter(userId, ip) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      headers: {},
      body: null,
      set(name, value) {
        this.headers[name] = value;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve(this);
        return this;
      },
    };

    aiRequestRateLimiter({ user: { id: userId }, ip }, response, (error) => {
      if (error) return reject(error);
      return resolve(response);
    });
  });
}

test("per-user limits apply at the route; the shared cap is not counted there", async () => {
  const firstRequest = await runLimiter("user-1", "198.51.100.1");
  assert.equal(firstRequest.statusCode, 200);

  const perUserLimited = await runLimiter("user-1", "198.51.100.1");
  assert.equal(perUserLimited.statusCode, 429);
  assert.match(perUserLimited.body.message, /Too many requests/);

  // More users than the shared cap (2) all pass the route limiter.
  for (const userId of ["user-2", "user-3", "user-4"]) {
    const response = await runLimiter(userId, "198.51.100.2");
    assert.equal(response.statusCode, 200, `${userId} should pass`);
  }
});

test("the shared daily cap is counted per reserved AI call", async () => {
  await reserveGlobalAiRequest();
  await reserveGlobalAiRequest();

  await assert.rejects(reserveGlobalAiRequest(), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.code, "ai_daily_limit_reached");
    assert.match(error.message, /shared daily AI usage limit/);
    assert.equal(error.retryAfterSeconds, 86400);
    return true;
  });
});

test("legacy resume and cover-letter AI routes use the shared cutoff", () => {
  for (const path of ["/generate-resume", "/generate-cover-letter"]) {
    const source = fs.readFileSync(
      require.resolve("../routes/aiRoutes"),
      "utf8",
    );
    const routeName = path.slice(1);
    const routePattern = new RegExp(
      `router\\.post\\(\\s*['"]/${routeName}['"],([\\s\\S]*?)\\n\\);`,
    );
    const routeMatch = source.match(routePattern);

    assert.ok(routeMatch, `Expected route ${path} to exist`);
    assert.ok(
      routeMatch[1].includes("aiRequestRateLimiter"),
      `Expected ${path} to use the shared AI request limiter`,
    );
  }
});
