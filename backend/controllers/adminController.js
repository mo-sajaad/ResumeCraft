const {
  listFeatureFlags,
  upsertFeatureFlag,
  getUsageSummary,
  getAuditLogs,
} = require('../services/adminService');
const { createAuditLog } = require('../services/auditLogService');
const { validate } = require('../shared/http/validators');
const { updateFeatureFlagSchema, adminAnalyticsQuerySchema, adminAuditQuerySchema } = require('../modules/admin/schemas/adminSchemas');

async function getFeatureFlags(req, res, next) {
  try {
    const flags = await listFeatureFlags();
    return res.json({ flags });
  } catch (error) {
    return next(error);
  }
}

async function updateFeatureFlag(req, res, next) {
  try {
    const key = req.params.key;
    const { description, enabled, rolloutPercent } = validate(updateFeatureFlagSchema, req.body || {});

    const updated = await upsertFeatureFlag({ key, description, enabled, rolloutPercent });

    await createAuditLog({
      actorUserId: req.user.id,
      actorFirebaseUid: req.user.firebaseUid,
      action: 'feature_flag.update',
      resourceType: 'feature_flag',
      resourceId: key,
      metadata: { enabled: updated.enabled, rollout_percent: updated.rollout_percent },
    });

    return res.json({ flag: updated });
  } catch (error) {
    return next(error);
  }
}

async function getAnalytics(req, res, next) {
  try {
    const { days } = validate(adminAnalyticsQuerySchema, req.query || {});
    const events = await getUsageSummary({ days });
    return res.json({ days, events });
  } catch (error) {
    return next(error);
  }
}

async function getAdminAuditLogs(req, res, next) {
  try {
    const { limit } = validate(adminAuditQuerySchema, req.query || {});
    const logs = await getAuditLogs({ limit });
    return res.json({ logs });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getFeatureFlags,
  updateFeatureFlag,
  getAnalytics,
  getAdminAuditLogs,
};
