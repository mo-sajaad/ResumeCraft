const subscriptionRepository = require('../modules/billing/repositories/subscriptionRepository');

async function getActiveSubscription(userId) {
  return subscriptionRepository.getActiveSubscriptionPlan(userId);
}

async function getMonthlyUsage(userId, type) {
  return subscriptionRepository.getMonthlyUsageCount(userId, type);
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

// Atomically checks the monthly limit and reserves one unit. Release the
// reservation with releaseUsage if the generation does not complete.
async function reserveUsage(userId, type) {
  const plan = await getActiveSubscription(userId);

  if (!plan) {
    throw new Error('No active subscription found.');
  }

  const limit =
    type === 'resume'
      ? plan.monthly_resume_limit
      : plan.monthly_cover_letter_limit;

  const reservationId = await subscriptionRepository.reserveUsage(userId, type, limit ?? null);

  return { allowed: reservationId !== null, plan, reservationId };
}

async function releaseUsage(reservationId) {
  await subscriptionRepository.deleteUsage(reservationId);
}

async function trackUsage(userId, type) {
  await subscriptionRepository.insertUsage(userId, type);
}

async function getLatestStripeCustomerId(userId) {
  return subscriptionRepository.getLatestStripeCustomerId(userId);
}

module.exports = {
  getActiveSubscription,
  checkLimit,
  trackUsage,
  reserveUsage,
  releaseUsage,
  getLatestStripeCustomerId,
};
