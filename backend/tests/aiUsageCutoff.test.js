const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

process.env.NODE_ENV = "test";
process.env.MAX_AI_REQUESTS_PER_MINUTE = "1";
process.env.MAX_GLOBAL_AI_REQUESTS_PER_DAY = "2";
delete process.env.REDIS_URL;

const { aiRequestRateLimiter } = require("../middleware/aiAbuseProtection");

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

test("global AI cutoff aggregates requests across users after per-user throttling", async () => {
  const firstRequest = await runLimiter("user-1", "198.51.100.1");
  assert.equal(firstRequest.statusCode, 200);

  const perUserLimited = await runLimiter("user-1", "198.51.100.1");
  assert.equal(perUserLimited.statusCode, 429);
  assert.match(perUserLimited.body.message, /Too many requests/);

  const secondUserRequest = await runLimiter("user-2", "198.51.100.2");
  assert.equal(secondUserRequest.statusCode, 200);

  const globallyLimited = await runLimiter("user-3", "198.51.100.3");
  assert.equal(globallyLimited.statusCode, 429);
  assert.match(globallyLimited.body.message, /shared daily AI usage limit/);
  assert.equal(globallyLimited.headers["Retry-After"], "86400");
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
