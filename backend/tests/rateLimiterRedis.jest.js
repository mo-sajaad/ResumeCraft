// PLATFORM-003 and PLATFORM-009: the rate limiter against a fake Redis client.
// config/redis is mocked, so no Redis connection is ever opened.
const { spawnSync } = require('node:child_process');

const mockRedis = { client: null };
const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };

jest.mock('../config/redis', () => ({
  getRedisClient: () => mockRedis.client,
  REDIS_COMMAND_TIMEOUT_MS: 1000,
}));
jest.mock('../observability/logger', () => mockLogger);

const originalNodeEnv = process.env.NODE_ENV;

// The single-command methods answer like EVAL, so code that used them instead
// (before PLATFORM-009) sees the same stalls and failures.
function fakeClient(evalImpl) {
  return {
    eval: jest.fn(evalImpl),
    incr: jest.fn(evalImpl),
    pExpire: jest.fn(evalImpl),
    pTTL: jest.fn(evalImpl),
  };
}

function loadLimiter() {
  let mod;
  jest.isolateModules(() => { mod = require('../middleware/rateLimiter'); });
  return mod;
}

// Resolves when the middleware either answers or calls next(); records both.
function run(middleware, req = { ip: '203.0.113.5' }) {
  const outcome = { statusCode: null, body: null, headers: {}, nextCalls: 0 };
  const res = {
    set(name, value) { outcome.headers[name] = value; return this; },
    status(code) { outcome.statusCode = code; return this; },
    json(body) { outcome.body = body; return this; },
  };
  const done = Promise.resolve(middleware(req, res, () => { outcome.nextCalls += 1; }));
  return { outcome, done };
}

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  mockRedis.client = null;
  jest.useRealTimers();
});

describe('Redis failures (PLATFORM-003)', () => {
  it('answers 503 in production when a Redis command stalls past 1 s', async () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'production';
    mockRedis.client = fakeClient(() => new Promise(() => {}));
    const { createRateLimiter } = loadLimiter();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });

    const { outcome, done } = run(limiter);
    let settled = false;
    done.then(() => { settled = true; });

    await jest.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await done;
    expect(outcome.statusCode).toBe(503);
    expect(outcome.body).toEqual({ message: 'Service temporarily unavailable.' });
    expect(outcome.nextCalls).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: 'Redis command timed out after 1000 ms' }) }),
      'Rate limiter Redis operation failed',
    );
  });

  it('answers 503 in production when Redis rejects (offline queue disabled)', async () => {
    process.env.NODE_ENV = 'production';
    mockRedis.client = fakeClient(() => Promise.reject(new Error('The client is closed')));
    const { createRateLimiter } = loadLimiter();

    const { outcome, done } = run(createRateLimiter({ max: 5 }));
    await done;
    expect(outcome.statusCode).toBe(503);
    expect(outcome.nextCalls).toBe(0);
  });

  it('falls back to memory in development after a timeout and calls next() exactly once', async () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'development';
    mockRedis.client = fakeClient(() => new Promise(() => {}));
    const { createRateLimiter } = loadLimiter();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    const first = run(limiter);
    await jest.advanceTimersByTimeAsync(1000);
    await first.done;
    expect(first.outcome.nextCalls).toBe(1);
    expect(first.outcome.statusCode).toBeNull();

    // The fallback really counts: the second request is over max 1.
    const second = run(limiter);
    await jest.advanceTimersByTimeAsync(1000);
    await second.done;
    expect(second.outcome.nextCalls).toBe(0);
    expect(second.outcome.statusCode).toBe(429);
    expect(second.outcome.headers['Retry-After']).toBeDefined();
  });

  it('the shared counter throws a 503 rate_limit_unavailable error in production', async () => {
    process.env.NODE_ENV = 'production';
    mockRedis.client = fakeClient(() => Promise.reject(new Error('connection refused')));
    const { createRateCounter } = loadLimiter();
    const consume = createRateCounter({ windowMs: 1000, max: 1 });

    await expect(consume('ai:global:daily')).rejects.toMatchObject({
      status: 503,
      code: 'rate_limit_unavailable',
      message: 'Service temporarily unavailable.',
    });
  });

  it('the Redis client is created without an offline queue and with a 2 s connect timeout', () => {
    const createClient = jest.fn(() => ({
      on: jest.fn(),
      connect: jest.fn(() => Promise.resolve()),
    }));
    let options;
    jest.isolateModules(() => {
      jest.doMock('redis', () => ({ createClient }));
      process.env.REDIS_URL = 'redis://127.0.0.1:1';
      try {
        const { getRedisClient, REDIS_COMMAND_TIMEOUT_MS } = jest.requireActual('../config/redis');
        getRedisClient();
        expect(REDIS_COMMAND_TIMEOUT_MS).toBe(1000);
      } finally {
        delete process.env.REDIS_URL;
      }
    });
    expect(createClient).toHaveBeenCalledTimes(1);
    [options] = createClient.mock.calls[0];
    expect(options).toMatchObject({
      disableOfflineQueue: true,
      socket: { connectTimeout: 2000 },
    });
  });
});

describe('atomic counter script (PLATFORM-009)', () => {
  it('sends one EVAL on ratelimit:<key> and uses its count and TTL for 429 and Retry-After', async () => {
    process.env.NODE_ENV = 'production';
    const replies = [[1, 60_000], [2, 59_000], [3, 4_200]];
    mockRedis.client = fakeClient(() => Promise.resolve(replies.shift()));
    const { createRateLimiter } = loadLimiter();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      keyGenerator: (req) => `ai:${req.user.id}`,
      message: 'Slow down.',
    });
    const req = { user: { id: 'u-42' }, ip: '203.0.113.5' };

    for (let i = 0; i < 2; i += 1) {
      const { outcome, done } = run(limiter, req);
      await done;
      expect(outcome.nextCalls).toBe(1);
    }

    const { outcome, done } = run(limiter, req);
    await done;
    expect(outcome.statusCode).toBe(429);
    expect(outcome.body).toEqual({ message: 'Slow down.' });
    expect(outcome.headers['Retry-After']).toBe('5');
    expect(outcome.nextCalls).toBe(0);

    // Exactly one command per request, never a separate INCR / PEXPIRE / PTTL.
    expect(mockRedis.client.eval).toHaveBeenCalledTimes(3);
    for (const [script, options] of mockRedis.client.eval.mock.calls) {
      expect(options).toEqual({ keys: ['ratelimit:ai:u-42'], arguments: ['60000'] });
      expect(script).toMatch(/redis\.call\('INCR', KEYS\[1\]\)/);
      expect(script).toMatch(/redis\.call\('PTTL', KEYS\[1\]\)/);
      expect(script).toMatch(/if ttl < 0 then\s+redis\.call\('PEXPIRE', KEYS\[1\], ARGV\[1\]\)/);
      expect(script).toMatch(/return \{count, ttl\}/);
    }
  });

  it('reports Retry-After of at least 1 s when the TTL is at or below zero', async () => {
    process.env.NODE_ENV = 'production';
    mockRedis.client = fakeClient(() => Promise.resolve(['9', '0']));
    const { createRateLimiter } = loadLimiter();

    const { outcome, done } = run(createRateLimiter({ max: 1 }));
    await done;
    expect(outcome.statusCode).toBe(429);
    expect(outcome.headers['Retry-After']).toBe('1');
  });

  // Runs the script the limiter actually sends, with a scripted redis.call, in
  // LuaJIT when it is installed. Skipped otherwise; nothing here talks to Redis.
  const luajit = spawnSync('luajit', ['-v'], { encoding: 'utf8' });
  const hasLuajit = luajit.status === 0;
  (hasLuajit ? it : it.skip)('the script gives a key without a TTL the window and keeps an existing TTL', async () => {
    mockRedis.client = fakeClient(() => Promise.resolve([1, 1]));
    const { createRateLimiter } = loadLimiter();
    const { done } = run(createRateLimiter({ windowMs: 60_000, max: 5 }));
    await done;
    const [script] = mockRedis.client.eval.mock.calls[0];
    expect(script).not.toMatch(/\]==\]/);

    function runScript(start) {
      const harness = `
        local store = { count = ${start.count}, ttl = ${start.ttl} }
        local calls = {}
        redis = { call = function(cmd, key, arg)
          calls[#calls + 1] = cmd .. ' ' .. key .. (arg and (' ' .. arg) or '')
          if cmd == 'INCR' then store.count = store.count + 1; if store.ttl == -2 then store.ttl = -1 end; return store.count end
          if cmd == 'PTTL' then return store.ttl end
          if cmd == 'PEXPIRE' then store.ttl = tonumber(arg); return 1 end
          error('unexpected command ' .. cmd)
        end }
        KEYS = { 'ratelimit:k' }
        ARGV = { '60000' }
        local reply = assert(loadstring([==[${script}]==]))()
        print(reply[1] .. ' ' .. reply[2] .. ' ' .. store.ttl)
        print(table.concat(calls, ','))
      `;
      const result = spawnSync('luajit', ['-'], { input: harness, encoding: 'utf8' });
      expect(result.stderr).toBe('');
      const [values, calls] = result.stdout.trim().split('\n');
      const [count, ttl, storedTtl] = values.split(' ').map(Number);
      return { count, ttl, storedTtl, calls: calls.split(',') };
    }

    // New key (PTTL -2 before INCR, -1 after): expiry set to the window.
    expect(runScript({ count: 0, ttl: -2 })).toEqual({
      count: 1, ttl: 60000, storedTtl: 60000,
      calls: ['INCR ratelimit:k', 'PTTL ratelimit:k', 'PEXPIRE ratelimit:k 60000'],
    });
    // A key that lost its TTL earlier is repaired on the next hit.
    expect(runScript({ count: 7, ttl: -1 })).toEqual({
      count: 8, ttl: 60000, storedTtl: 60000,
      calls: ['INCR ratelimit:k', 'PTTL ratelimit:k', 'PEXPIRE ratelimit:k 60000'],
    });
    // An existing TTL is left alone and reported.
    expect(runScript({ count: 3, ttl: 1234 })).toEqual({
      count: 4, ttl: 1234, storedTtl: 1234,
      calls: ['INCR ratelimit:k', 'PTTL ratelimit:k'],
    });
  });
});
