const pool = require('../config/db');
const logger = require('./logger');

const READINESS_TIMEOUT_MS = 2000;

// Liveness: the process answers. No dependencies, so a database outage does
// not get the instance restarted.
function healthz(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok' });
}

// Readiness: the database answers within a short time. Failure details stay in
// the logs.
async function readyz(req, res) {
  res.set('Cache-Control', 'no-store');
  let timer;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness check timed out')), READINESS_TIMEOUT_MS);
      }),
    ]);
    res.json({ status: 'ok' });
  } catch (error) {
    logger.warn({ err: error }, 'Readiness check failed');
    res.status(503).json({ status: 'unavailable' });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { healthz, readyz, READINESS_TIMEOUT_MS };
