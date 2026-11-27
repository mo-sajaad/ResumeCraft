const { getRedisClient, REDIS_COMMAND_TIMEOUT_MS } = require('../config/redis');
const logger = require('../observability/logger');

const WINDOW_SWEEP_INTERVAL_MS = 60 * 1000;

// Increments the counter and makes sure it has an expiry in one atomic step, so a
// key can never be left without a TTL (PLATFORM-009). Returns [count, ttlMs].
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// node-redis has no per-command timeout; a stalled connection must not hang the request.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis command timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createInMemoryCounter({ windowMs }) {
  const store = new Map();

  const intervalId = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of store.entries()) {
      if (value.expiresAt <= now) {
        store.delete(key);
      }
    }
  }, WINDOW_SWEEP_INTERVAL_MS);

  if (typeof intervalId.unref === 'function') {
    intervalId.unref();
  }

  return function hit(key) {
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;
    return { count: entry.count, ttlMs: entry.expiresAt - now };
  };
}

async function redisHit(redis, redisKey, windowMs) {
  const reply = await withTimeout(
    redis.eval(INCREMENT_SCRIPT, { keys: [redisKey], arguments: [String(windowMs)] }),
    REDIS_COMMAND_TIMEOUT_MS,
  );
  const [count, ttlMs] = reply.map(Number);
  return { count, ttlMs };
}

// Counts one hit against `key` and reports whether it is within `max` per window.
// Uses Redis when configured. If Redis fails, production throws a 503 error
// (fail closed); other environments fall back to an in-memory counter.
function createRateCounter({ windowMs = 60_000, max = 60 } = {}) {
  const redis = getRedisClient();
  const memoryHit = createInMemoryCounter({ windowMs });

  return async function consume(key) {
    let result;

    if (!redis) {
      result = memoryHit(key);
    } else {
      try {
        result = await redisHit(redis, `ratelimit:${key}`, windowMs);
      } catch (error) {
        logger.error({ err: error }, 'Rate limiter Redis operation failed');
        if (process.env.NODE_ENV === 'production') {
          const unavailable = new Error('Service temporarily unavailable.');
          unavailable.status = 503;
          unavailable.code = 'rate_limit_unavailable';
          throw unavailable;
        }

        result = memoryHit(key);
      }
    }

    return {
      allowed: result.count <= max,
      retryAfterSeconds: Math.max(1, Math.ceil(Math.max(0, result.ttlMs) / 1000)),
    };
  };
}

function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  keyGenerator,
  message = 'Too many requests. Please try again shortly.',
} = {}) {
  const consume = createRateCounter({ windowMs, max });

  return async function rateLimitMiddleware(req, res, next) {
    const key = keyGenerator ? keyGenerator(req) : getClientIp(req);

    let result;
    try {
      result = await consume(key);
    } catch (error) {
      return res.status(503).json({ message: error.message });
    }

    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ message });
    }

    return next();
  };
}

module.exports = {
  createRateCounter,
  createRateLimiter,
};
