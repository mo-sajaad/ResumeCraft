require('./testRun');
const logger = require('../observability/logger');

let redisClient;
let redisUnavailable = false;

function getRedisClient() {
  if (redisUnavailable) return null;
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL is required in production for rate limiting.');
    }
    return null;
  }

  let createClient;
  try {
    ({ createClient } = require('redis'));
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error("Redis SDK missing. Install 'redis' package for production rate limiting.");
    }

    redisUnavailable = true;
    console.warn('[rateLimiter] Redis SDK unavailable; using in-memory fallback for non-production.');
    return null;
  }

  redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (error) => {
    logger.error({ err: error }, 'Redis client error');
  });

  redisClient.connect().catch((error) => {
    logger.error({ err: error }, 'Redis connection failed');
  });

  return redisClient;
}

module.exports = {
  getRedisClient,
};
