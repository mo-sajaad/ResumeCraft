const pool = require('../../../config/db');

async function listFeatureFlags() {
  const result = await pool.query(
    `SELECT key, description, enabled, rollout_percent, created_at, updated_at
     FROM feature_flags
     ORDER BY key ASC`
  );
  return result.rows;
}

const auditLogRepository = require('./auditLogRepository');

const FLAG_COLUMNS = 'key, description, enabled, rollout_percent, created_at, updated_at';

// An omitted rolloutPercent keeps the stored value; 100 applies only to a new
// flag (ADMIN-006).
async function upsertFeatureFlag({ key, description, enabled, rolloutPercent }, db = pool) {
  const rollout = rolloutPercent === undefined || rolloutPercent === null
    ? null
    : Math.max(0, Math.min(100, Number(rolloutPercent)));
  const result = await db.query(
    `INSERT INTO feature_flags (key, description, enabled, rollout_percent, updated_at)
     VALUES ($1, $2, $3, COALESCE($4::int, 100), NOW())
     ON CONFLICT (key)
     DO UPDATE SET
       description = CASE WHEN $5::boolean THEN EXCLUDED.description ELSE feature_flags.description END,
       enabled = EXCLUDED.enabled,
       rollout_percent = COALESCE($4::int, feature_flags.rollout_percent),
       updated_at = NOW()
     RETURNING ${FLAG_COLUMNS}`,
    // An omitted description keeps the stored one; null or '' clears it (ADMIN-011).
    [key, description || null, Boolean(enabled), rollout, description !== undefined]
  );
  return result.rows[0] || null;
}

// A failed ROLLBACK must not replace the error that caused it.
async function rollbackQuietly(client) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // The connection is released by the caller; the original error is rethrown.
  }
}

// Changes the flag and writes its audit record in one transaction, so neither
// is kept without the other (ADMIN-007). `buildAudit(before, after)` returns
// the audit entry, or null to skip it; `before` is null for a new flag.
async function updateFeatureFlagWithAudit(input, buildAudit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const previous = await client.query(
      `SELECT ${FLAG_COLUMNS} FROM feature_flags WHERE key = $1 FOR UPDATE`,
      [input.key]
    );
    const before = previous.rows[0] || null;
    const after = await upsertFeatureFlag(input, client);
    const audit = buildAudit(before, after);
    if (audit) await auditLogRepository.insertAuditLog(audit, client);
    await client.query('COMMIT');
    return { before, after };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

const USAGE_SUMMARY_LIMIT = 50;

// Totals per route and event type over the whole window, largest first. Only
// the top USAGE_SUMMARY_LIMIT groups are returned; `truncated` says whether
// more exist, and `totalEvents` counts every event in the window (ADMIN-010).
async function listUsageSummary(days) {
  const result = await pool.query(
    `WITH grouped AS (
       SELECT route, event_type, COUNT(*)::int AS count
       FROM usage_events
       WHERE occurred_at >= NOW() - ($1::text || ' days')::interval
       GROUP BY route, event_type
     )
     SELECT route, event_type, count,
       COUNT(*) OVER ()::int AS group_count,
       SUM(count) OVER ()::bigint AS total_events
     FROM grouped
     ORDER BY count DESC, route ASC NULLS LAST, event_type ASC
     LIMIT $2`,
    [String(days), USAGE_SUMMARY_LIMIT]
  );
  const [first] = result.rows;
  return {
    events: result.rows.map(({ route, event_type: eventType, count }) => ({ route, event_type: eventType, count })),
    truncated: Boolean(first) && Number(first.group_count) > result.rows.length,
    totalEvents: first ? Number(first.total_events) : 0,
  };
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
  updateFeatureFlagWithAudit,
  listUsageSummary,
  listAuditLogs,
};
