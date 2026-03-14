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
  getLatestStripeCustomerId,
};
