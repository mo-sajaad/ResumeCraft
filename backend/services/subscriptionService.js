const pool = require('../config/db');

async function getActiveSubscription(userId) {
  const result = await pool.query(
    `
    SELECT p.*
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.user_id = $1
      AND s.status = 'active'
      AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
    ORDER BY s.created_at DESC
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

async function getMonthlyUsage(userId, type) {
  const result = await pool.query(
    `
    SELECT COUNT(*)
    FROM ai_usage
    WHERE user_id = $1
      AND type = $2
      AND created_at >= date_trunc('month', CURRENT_DATE)
    `,
    [userId, type]
  );

  return parseInt(result.rows[0].count);
}

async function checkLimit(userId, type) {
  const plan = await getActiveSubscription(userId);

  if (!plan) {
    throw new Error('No active subscription found.');
  }

  const usage = await getMonthlyUsage(userId, type);

  const limit =
    type === 'resume'
      ? plan.monthly_resume_limit
      : plan.monthly_cover_letter_limit;

  if (limit === null) {
    return { allowed: true, plan };
  }

  if (usage >= limit) {
    return { allowed: false, plan };
  }

  return { allowed: true, plan };
}

async function trackUsage(userId, type) {
  await pool.query(
    `INSERT INTO ai_usage (user_id, type) VALUES ($1, $2)`,
    [userId, type]
  );
}

module.exports = {
  getActiveSubscription,
  checkLimit,
  trackUsage,
};
