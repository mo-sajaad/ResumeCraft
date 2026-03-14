const { getAllFlagsForUser } = require('../services/featureFlagService');

function requireFeatureFlag(flagKey) {
  return async (req, res, next) => {
    try {
      const flags = await getAllFlagsForUser(req.user?.firebaseUid);
      req.featureFlags = flags;

      if (!flags[flagKey]) {
        return res.status(403).json({ error: 'Feature is not enabled for your account.' });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = requireFeatureFlag;
