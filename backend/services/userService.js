const pool = require('../config/db');

async function ensureDefaultSubscription(client, userId) {
  const existingSubscription = await client.query(
    `
    SELECT id
    FROM subscriptions
    WHERE user_id = $1
      AND status = 'active'
      AND (current_period_end IS NULL OR current_period_end > NOW())
    LIMIT 1
    `,
    [userId]
  );

  if (existingSubscription.rows.length > 0) {
    return;
  }

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
    `,
    [userId, freePlan.rows[0].id]
  );
}

async function findOrCreateUser(firebaseUid, email) {
  console.log("findOrCreateUser called with:");
  console.log("firebaseUid:", firebaseUid);
  console.log("email:", email);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );

    if (existing.rows.length > 0) {
      await ensureDefaultSubscription(client, existing.rows[0].id);
      await client.query('COMMIT');
      return existing.rows[0];
    }

    const result = await client.query(
      `INSERT INTO users (firebase_uid, email)
       VALUES ($1, $2)
       RETURNING *`,
      [firebaseUid, email]
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
      COALESCE(p.job_alerts, FALSE) AS job_alerts
    FROM users u
    LEFT JOIN user_preferences p ON p.user_id = u.id
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
