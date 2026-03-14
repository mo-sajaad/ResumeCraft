const {
  getUserProfileByFirebaseUid,
  updateUserPreferences,
} = require('../services/userService');
const { isAdminUid } = require('../services/adminService');

function ensureAuthorizedUser(req, res) {
  if (req.user?.firebaseUid !== req.params.firebaseUid) {
    res.status(403).json({ error: 'Forbidden: cannot access another user profile.' });
    return false;
  }

  return true;
}

function validatePreferencesPayload(req, res) {
  const { weeklyInsights, jobAlerts } = req.body || {};

  if (weeklyInsights !== undefined && typeof weeklyInsights !== 'boolean') {
    res.status(400).json({ error: 'weeklyInsights must be a boolean when provided.' });
    return false;
  }

  if (jobAlerts !== undefined && typeof jobAlerts !== 'boolean') {
    res.status(400).json({ error: 'jobAlerts must be a boolean when provided.' });
    return false;
  }

  return true;
}

async function getUserProfile(req, res, next) {
  try {
    if (!ensureAuthorizedUser(req, res)) return;

    const profile = await getUserProfileByFirebaseUid(req.params.firebaseUid);

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    return res.json({
      ...profile,
      is_admin: isAdminUid(req.params.firebaseUid),
    });
  } catch (error) {
    return next(error);
  }
}

async function patchUserPreferences(req, res, next) {
  try {
    if (!ensureAuthorizedUser(req, res)) return;
    if (!validatePreferencesPayload(req, res)) return;

    const { weeklyInsights, jobAlerts } = req.body || {};

    const preferences = await updateUserPreferences(req.params.firebaseUid, {
      weeklyInsights,
      jobAlerts,
    });

    return res.json(preferences);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getUserProfile,
  patchUserPreferences,
};