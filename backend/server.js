require('./config/env');

// Sentry v8 instruments modules as they load, so it starts before Express.
const { initSentry, Sentry } = require('./observability/sentry');

const sentryEnabled = initSentry();

const logger = require('./observability/logger');
const pool = require('./config/db');
const { getRedisClient } = require('./config/redis');
const { createApp } = require('./app');

// Cloud Run sends SIGKILL 10 s after SIGTERM, so the default leaves time to
// close the database pool and Redis.
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8000;

function shutdownTimeoutMs() {
  const raw = process.env.SHUTDOWN_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
    throw new Error('Invalid SHUTDOWN_TIMEOUT_MS: must be a positive integer.');
  }
  return Number(raw);
}

function assertCriticalSecrets() {
  const jwtSecret = process.env.JWT_SECRET_KEY;
  if (!jwtSecret || !jwtSecret.trim()) {
    throw new Error('Missing JWT_SECRET_KEY. Refusing to start server.');
  }
}

assertCriticalSecrets();
const SHUTDOWN_TIMEOUT_MS = shutdownTimeoutMs();

const app = createApp({ sentryEnabled });

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, sentryEnabled }, 'Server started');
});

async function closeDependencies() {
  const results = await Promise.allSettled([
    pool.end(),
    (async () => {
      // config/redis.js has no close helper; in production the rate limiter
      // has already created the client, elsewhere this is usually null.
      const redis = getRedisClient();
      if (!redis) return;
      if (redis.isReady) await redis.quit();
      else if (redis.isOpen) await redis.disconnect();
    })(),
    sentryEnabled ? Sentry.close(2000) : null,
  ]);
  for (const result of results) {
    if (result.status === 'rejected') logger.warn({ err: result.reason }, 'Shutdown: closing a dependency failed');
  }
}

let shuttingDown = false;

// Stops accepting connections, lets in-flight requests finish within
// SHUTDOWN_TIMEOUT_MS, then closes the pool and Redis and exits.
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Shutdown timed out; exiting with requests still open');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async (error) => {
    if (error) logger.warn({ err: error }, 'Shutdown: server close failed');
    await closeDependencies();
    logger.info('Shutdown complete');
    process.exit(0);
  });
  // Keep-alive sockets with no request in flight would otherwise hold close().
  server.closeIdleConnections();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
