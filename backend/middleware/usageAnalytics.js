const pool = require('../config/db');

function usageAnalytics(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', async () => {
    if (!req.user?.id) return;

    const durationMs = Date.now() - startedAt;
    const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : req.path;

    try {
      await pool.query(
        `INSERT INTO usage_events (user_id, firebase_uid, event_type, route, method, status_code, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user.id,
          req.user.firebaseUid,
          'api_request',
          route || 'unknown',
          req.method,
          res.statusCode,
          durationMs,
        ]
      );
    } catch (_error) {
      // Avoid breaking request lifecycle due to analytics persistence failures.
    }
  });

  next();
}

module.exports = usageAnalytics;
