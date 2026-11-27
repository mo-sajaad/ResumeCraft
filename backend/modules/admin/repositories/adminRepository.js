const pool = require('../../../config/db');

async function listFeatureFlags() {
  const result = await pool.query(
    `SELECT key, description, enabled, rollout_percent, created_at, updated_at
     FROM feature_flags
     ORDER BY key ASC`
  );
  return result.rows;
}

// An omitted rolloutPercent keeps the stored value; 100 applies only to a new
// flag (ADMIN-006).
async function upsertFeatureFlag({ key, description, enabled, rolloutPercent }) {
  const rollout = rolloutPercent === undefined || rolloutPercent === null
    ? null
    : Math.max(0, Math.min(100, Number(rolloutPercent)));
  const result = await pool.query(
    `INSERT INTO feature_flags (key, description, enabled, rollout_percent, updated_at)
     VALUES ($1, $2, $3, COALESCE($4::int, 100), NOW())
     ON CONFLICT (key)
     DO UPDATE SET
       description = COALESCE(EXCLUDED.description, feature_flags.description),
       enabled = EXCLUDED.enabled,
       rollout_percent = COALESCE($4::int, feature_flags.rollout_percent),
       updated_at = NOW()
     RETURNING key, description, enabled, rollout_percent, created_at, updated_at`,
    [key, description || null, Boolean(enabled), rollout]
  );
  return result.rows[0] || null;
}

async function listUsageSummary(days) {
  const result = await pool.query(
    `SELECT
       date_trunc('day', occurred_at) AS day,
       route,
       event_type,
       COUNT(*)::int AS count
     FROM usage_events
     WHERE occurred_at >= NOW() - ($1::text || ' days')::interval
     GROUP BY 1,2,3
     ORDER BY day DESC, count DESC
     LIMIT 500`,
    [String(days)]
  );
  return result.rows;
}

async function listAuditLogs(limit) {
  const result = await pool.query(
    `SELECT id, actor_user_id, actor_firebase_uid, action, resource_type, resource_id, metadata, created_at
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(500, Number(limit) || 100))]
  );
  return result.rows;
}

module.exports = {
  listFeatureFlags,
  upsertFeatureFlag,
  listUsageSummary,
  listAuditLogs,
};
