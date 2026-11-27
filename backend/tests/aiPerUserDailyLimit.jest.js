// PLATFORM-004: the per-user daily AI limit (MAX_AI_REQUESTS_PER_USER_PER_DAY)
// on its own, its default and its startup check against the shared cap.
// No REDIS_URL is set, so the limiters use their in-memory counters.
jest.mock('../observability/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }));

const LIMIT_SETTINGS = [
  'MAX_AI_REQUESTS_PER_MINUTE',
  'MAX_GLOBAL_AI_REQUESTS_PER_DAY',
  'MAX_AI_REQUESTS_PER_USER_PER_DAY',
];

function loadProtection(settings = {}) {
  jest.resetModules();
  for (const name of LIMIT_SETTINGS) delete process.env[name];
  Object.assign(process.env, settings);
  return require('../middleware/aiAbuseProtection');
}

function runLimiter(limiter, userId) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      set(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve({ res: this, nextCalled: false }); return this; },
    };
    limiter({ user: { id: userId }, ip: '198.51.100.9' }, res, (error) => {
      if (error) return reject(error);
      return resolve({ res, nextCalled: true });
    });
  });
}

afterEach(() => {
  for (const name of LIMIT_SETTINGS) delete process.env[name];
});

describe('per-user daily AI limit', () => {
  it('stops one user after the daily limit while the per-minute limit is far away', async () => {
    const { aiRequestRateLimiter } = loadProtection({
      MAX_AI_REQUESTS_PER_MINUTE: '100',
      MAX_GLOBAL_AI_REQUESTS_PER_DAY: '10',
      MAX_AI_REQUESTS_PER_USER_PER_DAY: '3',
    });

    for (let i = 0; i < 3; i += 1) {
      const { nextCalled } = await runLimiter(aiRequestRateLimiter, 'daily-user');
      expect(nextCalled).toBe(true);
    }

    const { res, nextCalled } = await runLimiter(aiRequestRateLimiter, 'daily-user');
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ message: 'You have reached your daily AI request limit. Please try again later.' });
    // A fresh daily window: the wait is the whole day, not the per-minute window.
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(86_000);
    expect(Number(res.headers['Retry-After'])).toBeLessThanOrEqual(86_400);

    // Counted per user: someone else is unaffected.
    const other = await runLimiter(aiRequestRateLimiter, 'other-user');
    expect(other.nextCalled).toBe(true);
  });

  it('defaults to 5 per user under the default shared cap of 25', () => {
    const protection = loadProtection();
    expect(protection.MAX_GLOBAL_AI_REQUESTS_PER_DAY).toBe(25);
    expect(protection.MAX_AI_REQUESTS_PER_USER_PER_DAY).toBe(5);
  });

  it('defaults to one below a small shared cap', () => {
    expect(loadProtection({ MAX_GLOBAL_AI_REQUESTS_PER_DAY: '4' }).MAX_AI_REQUESTS_PER_USER_PER_DAY).toBe(3);
    expect(loadProtection({ MAX_GLOBAL_AI_REQUESTS_PER_DAY: '6' }).MAX_AI_REQUESTS_PER_USER_PER_DAY).toBe(5);
    expect(loadProtection({ MAX_GLOBAL_AI_REQUESTS_PER_DAY: '2' }).MAX_AI_REQUESTS_PER_USER_PER_DAY).toBe(1);
  });

  it('refuses to start when the per-user limit is not below the shared cap', () => {
    for (const perUser of ['5', '6']) {
      expect(() => loadProtection({
        MAX_GLOBAL_AI_REQUESTS_PER_DAY: '5',
        MAX_AI_REQUESTS_PER_USER_PER_DAY: perUser,
      })).toThrow('MAX_AI_REQUESTS_PER_USER_PER_DAY must be lower than MAX_GLOBAL_AI_REQUESTS_PER_DAY.');
    }

    expect(loadProtection({
      MAX_GLOBAL_AI_REQUESTS_PER_DAY: '5',
      MAX_AI_REQUESTS_PER_USER_PER_DAY: '4',
    }).MAX_AI_REQUESTS_PER_USER_PER_DAY).toBe(4);
  });

  it('refuses to start with an invalid per-user setting', () => {
    for (const raw of ['0', 'five', '-2', '1.5']) {
      expect(() => loadProtection({ MAX_AI_REQUESTS_PER_USER_PER_DAY: raw }))
        .toThrow('MAX_AI_REQUESTS_PER_USER_PER_DAY must be a whole number of at least 1.');
    }
  });
});
