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

module.exports = { findOrCreateUser };
