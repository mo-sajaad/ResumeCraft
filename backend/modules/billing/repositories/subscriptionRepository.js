const pool = require('../../../config/db');

async function getActiveSubscriptionPlan(userId) {
  const result = await pool.query(
    `SELECT p.*
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.user_id = $1
       AND s.status = 'active'
       AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getMonthlyUsageCount(userId, type) {
  const result = await pool.query(
    `SELECT COUNT(*)
     FROM ai_usage
     WHERE user_id = $1
       AND type = $2
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
    [userId, type]
  );
  return Number.parseInt(result.rows[0].count, 10);
}

async function insertUsage(userId, type) {
  await pool.query('INSERT INTO ai_usage (user_id, type) VALUES ($1, $2)', [userId, type]);
}

// Counts this month's usage and inserts one row under a per-user, per-type
// transaction lock, so concurrent requests cannot all pass the same count.
// Returns the new row id, or null when the limit is already reached.
// A null limit means unlimited.
async function reserveUsage(userId, type, limit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('ai_usage'), hashtext($1::text || ':' || $2::text))",
      [userId, type]
    );

    if (limit !== null) {
      const usage = await client.query(
        `SELECT COUNT(*)
         FROM ai_usage
         WHERE user_id = $1
           AND type = $2
           AND created_at >= date_trunc('month', CURRENT_DATE)`,
        [userId, type]
      );
      if (Number.parseInt(usage.rows[0].count, 10) >= limit) {
        await client.query('ROLLBACK');
        return null;
      }
    }

    const inserted = await client.query(
      'INSERT INTO ai_usage (user_id, type) VALUES ($1, $2) RETURNING id',
      [userId, type]
    );
    await client.query('COMMIT');
    return inserted.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function deleteUsage(usageId) {
  await pool.query('DELETE FROM ai_usage WHERE id = $1', [usageId]);
}

async function getLatestStripeCustomerId(userId) {
  const result = await pool.query(
    `SELECT stripe_customer_id
     FROM subscriptions
     WHERE user_id = $1
       AND stripe_customer_id IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.stripe_customer_id || null;
}

module.exports = {
  getActiveSubscriptionPlan,
  getMonthlyUsageCount,
  insertUsage,
  reserveUsage,
  deleteUsage,
  getLatestStripeCustomerId,
};
