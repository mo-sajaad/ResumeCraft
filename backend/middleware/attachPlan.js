// middlewares/attachPlan.js

const { getActiveSubscription } = require("../services/subscriptionService");

async function attachPlan(req, res, next) {
  try {
    const userId = req.user.id;

    const plan = await getActiveSubscription(userId);

    if (!plan) {
      return res.status(403).json({
        error: "No active subscription found."
      });
    }

    req.plan = plan;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = attachPlan;