const WINDOW_SWEEP_INTERVAL_MS = 60 * 1000;

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs = 60_000, max = 60, keyGenerator } = {}) {
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

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = keyGenerator ? keyGenerator(req) : getIp(req);

    const entry = store.get(key);

    if (!entry || entry.expiresAt <= now) {
      store.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.expiresAt - now) / 1000);
      res.set('Retry-After', String(Math.max(1, retryAfterSeconds)));
      return res.status(429).json({
        error: 'Too many requests. Please try again shortly.',
      });
    }

    return next();
  };
}

module.exports = {
  createRateLimiter,
};
