const pool = require('../../../config/db');

async function getFreePlanId(client) {
  const result = await client.query("SELECT id FROM plans WHERE code = 'free' AND active = TRUE LIMIT 1");
  return result.rows[0]?.id || null;
}

async function insertOrUpdateUser(client, { firebaseUid, email, fullName }) {
  const result = await client.query(
    `INSERT INTO users (firebase_uid, email, full_name)
     VALUES ($1, $2, NULLIF(BTRIM($3), ''))
     ON CONFLICT (firebase_uid)
     DO UPDATE SET
       email = EXCLUDED.email,
       full_name = COALESCE(EXCLUDED.full_name, users.full_name)
     RETURNING *`,
    [firebaseUid, email, fullName]
  );
  return result.rows[0] || null;
}

async function ensureDefaultSubscription(client, userId, freePlanId) {
  await client.query(
    `INSERT INTO subscriptions (user_id, plan_id, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING`,
    [userId, freePlanId]
  );
}

async function findByFirebaseUid(firebaseUid) {
  const result = await pool.query(
    'SELECT id, firebase_uid, email, token_version FROM users WHERE firebase_uid = $1 LIMIT 1',
    [firebaseUid]
  );
  return result.rows[0] || null;
}

async function incrementTokenVersion(firebaseUid) {
  const result = await pool.query(
    `UPDATE users
     SET token_version = COALESCE(token_version, 0) + 1,
         updated_at = NOW()
     WHERE firebase_uid = $1
     RETURNING token_version`,
    [firebaseUid]
  );
  return result.rows[0]?.token_version ?? null;
}

async function getProfileByFirebaseUid(firebaseUid) {
  const result = await pool.query(
    `
    SELECT
      u.firebase_uid,
      u.email,
      u.full_name,
      u.phone_e164,
      u.location_text,
      u.linkedin_url,
      u.avatar_url,
      COALESCE(p.weekly_insights, FALSE) AS weekly_insights,
      COALESCE(p.job_alerts, FALSE) AS job_alerts,
      active_plan.plan_code,
      active_plan.plan_name,
      active_plan.subscription_status,
      active_plan.current_period_end
    FROM users u
    LEFT JOIN user_preferences p ON p.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT
        pl.code AS plan_code,
        pl.name AS plan_name,
        s.status AS subscription_status,
        s.current_period_end
      FROM subscriptions s
      JOIN plans pl ON pl.id = s.plan_id
      WHERE s.user_id = u.id
        AND s.status = 'active'
        AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
      ORDER BY s.created_at DESC
      LIMIT 1
    ) AS active_plan ON TRUE
    WHERE u.firebase_uid = $1
    LIMIT 1
    `,
    [firebaseUid]
  );
  return result.rows[0] || null;
}

async function getUserIdByFirebaseUid(client, firebaseUid) {
  const result = await client.query('SELECT id FROM users WHERE firebase_uid = $1 LIMIT 1', [firebaseUid]);
  return result.rows[0]?.id || null;
}

async function getPreferencesByUserId(client, userId) {
  const result = await client.query(
    `SELECT weekly_insights, job_alerts
     FROM user_preferences
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function upsertPreferences(client, { userId, weeklyInsights, jobAlerts }) {
  const result = await client.query(
    `INSERT INTO user_preferences (user_id, weekly_insights, job_alerts, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       weekly_insights = EXCLUDED.weekly_insights,
       job_alerts = EXCLUDED.job_alerts,
       updated_at = NOW()
     RETURNING user_id, weekly_insights, job_alerts, updated_at`,
    [userId, weeklyInsights, jobAlerts]
  );
  return result.rows[0] || null;
}

function getPool() { return pool; }

module.exports = {
  getPool,
  getFreePlanId,
  insertOrUpdateUser,
  ensureDefaultSubscription,
  findByFirebaseUid,
  incrementTokenVersion,
  getProfileByFirebaseUid,
  getUserIdByFirebaseUid,
  getPreferencesByUserId,
  upsertPreferences,
};
