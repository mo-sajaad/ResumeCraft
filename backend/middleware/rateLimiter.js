const { getRedisClient, REDIS_COMMAND_TIMEOUT_MS } = require('../config/redis');
const logger = require('../observability/logger');

const WINDOW_SWEEP_INTERVAL_MS = 60 * 1000;

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

function createInMemoryLimiter({ windowMs, max, keyGenerator, message }) {
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

  return function inMemoryRateLimit(req, res, next) {
    const now = Date.now();
    const key = keyGenerator ? keyGenerator(req) : getClientIp(req);

    const entry = store.get(key);

    if (!entry || entry.expiresAt <= now) {
      store.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.expiresAt - now) / 1000);
      res.set('Retry-After', String(Math.max(1, retryAfterSeconds)));
      return res.status(429).json({ message });
    }

    return next();
  };
}

function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  keyGenerator,
  message = 'Too many requests. Please try again shortly.',
} = {}) {
  const redis = getRedisClient();
  const fallbackLimiter = createInMemoryLimiter({ windowMs, max, keyGenerator, message });

  if (!redis) {
    return fallbackLimiter;
  }

  return async function redisRateLimitMiddleware(req, res, next) {
    const key = keyGenerator ? keyGenerator(req) : getClientIp(req);
    const redisKey = `ratelimit:${key}`;

    let count;
    let ttlMs;

    try {
      count = await withTimeout(redis.incr(redisKey), REDIS_COMMAND_TIMEOUT_MS);

      if (count === 1) {
        await withTimeout(redis.pExpire(redisKey, windowMs), REDIS_COMMAND_TIMEOUT_MS);
      }

      if (count > max) {
        ttlMs = await withTimeout(redis.pTTL(redisKey), REDIS_COMMAND_TIMEOUT_MS);
      }
    } catch (error) {
      logger.error({ err: error }, 'Rate limiter Redis operation failed');
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ message: 'Service temporarily unavailable.' });
      }

      return fallbackLimiter(req, res, next);
    }

    if (count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil(Math.max(0, ttlMs) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ message });
    }

    return next();
  };
}

module.exports = {
  createRateLimiter,
};
