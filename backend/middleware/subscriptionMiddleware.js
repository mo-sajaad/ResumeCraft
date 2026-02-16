const { checkLimit } = require('../services/subscriptionService');

function enforceAIUsage(type) {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;

      const { allowed, plan } = await checkLimit(userId, type);

      if (!allowed) {
        return res.status(403).json({
          error: `Monthly ${type} limit reached for ${plan.name} plan.`,
        });
      }

      req.plan = plan;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = enforceAIUsage;
