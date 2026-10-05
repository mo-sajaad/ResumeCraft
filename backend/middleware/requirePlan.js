// middleware/requirePlan.js

const PLAN_RANK = {
  free: 0,
  premium: 1,
  pro: 2,
};

function requirePlan(minimumPlan) {
  const minimumRank = PLAN_RANK[minimumPlan];

  return (req, res, next) => {
    const userRank = PLAN_RANK[req.plan?.code];

    if (
      minimumRank === undefined ||
      userRank === undefined ||
      userRank < minimumRank
    ) {
      return res.status(403).json({
        error: `Upgrade to ${minimumPlan} to access this feature.`,
      });
    }

    next();
  };
}

module.exports = requirePlan;
