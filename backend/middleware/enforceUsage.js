// middlewares/enforceUsage.js

const { checkLimit } = require("../services/subscriptionService");

function enforceUsage(type) {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      const { allowed } = await checkLimit(userId, type);

      if (!allowed) {
        return res.status(403).json({
          error: "Monthly limit reached. Upgrade your plan.",
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = enforceUsage;