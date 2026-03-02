// middleware/requireFeature.js

function requireFeature(featureKey) {
  return (req, res, next) => {
    if (!req.plan || !req.plan[featureKey]) {
      return res.status(403).json({
        error: "Your current plan does not include this feature.",
      });
    }

    next();
  };
}

module.exports = requireFeature;