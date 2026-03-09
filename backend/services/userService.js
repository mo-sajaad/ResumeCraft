const pool = require('../config/db');

async function ensureDefaultSubscription(client, userId) {


  const freePlan = await client.query(
    `SELECT id FROM plans WHERE code = 'free' AND active = TRUE LIMIT 1`
  );

  if (freePlan.rows.length === 0) {
    throw new Error('Free subscription plan is not configured.');
  }

  await client.query(
    `
    INSERT INTO subscriptions (user_id, plan_id, status)
    VALUES ($1, $2, 'active')
    ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING
    `,
    [userId, freePlan.rows[0].id]
  );
}

async function findOrCreateUser(firebaseUid, email, fullName = null) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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

    const user = result.rows[0];
    await ensureDefaultSubscription(client, user.id);

    await client.query('COMMIT');

    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getUserProfileByFirebaseUid(firebaseUid) {
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

async function updateUserPreferences(firebaseUid, { weeklyInsights, jobAlerts }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id FROM users WHERE firebase_uid = $1 LIMIT 1',
      [firebaseUid]
    );

    if (!userResult.rows.length) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }

    const userId = userResult.rows[0].id;

    const currentPreferencesResult = await client.query(
      `
      SELECT weekly_insights, job_alerts
      FROM user_preferences
      WHERE user_id = $1
      `,
      [userId]
    );

    const currentPreferences = currentPreferencesResult.rows[0] || {
      weekly_insights: false,
      job_alerts: false,
    };

    const nextWeeklyInsights =
      typeof weeklyInsights === 'boolean' ? weeklyInsights : currentPreferences.weekly_insights;
    const nextJobAlerts = typeof jobAlerts === 'boolean' ? jobAlerts : currentPreferences.job_alerts;

    const updatedPreferencesResult = await client.query(
      `
      INSERT INTO user_preferences (user_id, weekly_insights, job_alerts, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        weekly_insights = EXCLUDED.weekly_insights,
        job_alerts = EXCLUDED.job_alerts,
        updated_at = NOW()
      RETURNING user_id, weekly_insights, job_alerts, updated_at
      `,
      [userId, nextWeeklyInsights, nextJobAlerts]
    );

    await client.query('COMMIT');
    return updatedPreferencesResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findOrCreateUser,
  getUserProfileByFirebaseUid,
  updateUserPreferences,
};
