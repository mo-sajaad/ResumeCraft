const { isFeatureEnabled } = require('../services/featureFlagService');

// Fails closed: a failed flag lookup is a server error, not a pass (ADMIN-005).
function requireFeatureFlag(flagKey) {
  return async (req, res, next) => {
    try {
      if (!(await isFeatureEnabled(flagKey, req.user?.firebaseUid))) {
        return res.status(403).json({ error: 'Feature is not enabled for your account.' });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = requireFeatureFlag;
