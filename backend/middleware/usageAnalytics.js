const pool = require('../config/db');
const { trackRoute, routeLabel } = require('../observability/routeLabel');
const { isFeatureEnabled } = require('../services/featureFlagService');

// Collection is skipped when usage_analytics is off for the user, missing or
// cannot be read (ADMIN-005).
async function collectionEnabled(firebaseUid) {
  try {
    return await isFeatureEnabled('usage_analytics', firebaseUid);
  } catch {
    return false;
  }
}

function usageAnalytics(req, res, next) {
  trackRoute(req);
  const startedAt = Date.now();

  res.on('finish', async () => {
    if (!req.user?.id) return;

    const durationMs = Date.now() - startedAt;
    if (!(await collectionEnabled(req.user.firebaseUid))) return;

    try {
      await pool.query(
        `INSERT INTO usage_events (user_id, firebase_uid, event_type, route, method, status_code, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user.id,
          req.user.firebaseUid,
          'api_request',
          routeLabel(req, res),
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
