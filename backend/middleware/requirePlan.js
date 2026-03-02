// middleware/requirePlan.js

const PLAN_RANK = {
  free: 0,
  premium: 1,
  pro: 2,
};

function requirePlan(minimumPlan) {
  return (req, res, next) => {
    const userPlan = req.plan;

    if (
      !userPlan ||
      PLAN_RANK[userPlan.code] < PLAN_RANK[minimumPlan]
    ) {
      return res.status(403).json({
        error: `Upgrade to ${minimumPlan} to access this feature.`,
      });
    }

    next();
  };
}

module.exports = requirePlan;