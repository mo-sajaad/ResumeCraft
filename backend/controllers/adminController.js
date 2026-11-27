const {
  listFeatureFlags,
  getUsageSummary,
  getAuditLogs,
} = require('../services/adminService');
const { auditEnabled, createAuditLog, requestContext } = require('../services/auditLogService');
const { clearFeatureFlagCache } = require('../services/featureFlagService');
const { updateFeatureFlagWithAudit } = require('../modules/admin/repositories/adminRepository');
const { validate } = require('../shared/http/validators');
const {
  featureFlagKeySchema,
  updateFeatureFlagSchema,
  adminAnalyticsQuerySchema,
  adminAuditQuerySchema,
} = require('../modules/admin/schemas/adminSchemas');

const flagState = (flag) => flag && {
  description: flag.description ?? null,
  enabled: flag.enabled,
  rollout_percent: flag.rollout_percent,
};

// Admin reads are recorded too (ADMIN-007); best effort, like session events.
function auditRead(req, action, metadata) {
  return createAuditLog({
    actorUserId: req.user.id,
    actorFirebaseUid: req.user.firebaseUid,
    action,
    resourceType: 'admin',
    metadata,
    request: req,
  });
}

async function getFeatureFlags(req, res, next) {
  try {
    const flags = await listFeatureFlags();
    await auditRead(req, 'admin.feature_flags.read');
    return res.json({ flags });
  } catch (error) {
    return next(error);
  }
}

async function updateFeatureFlag(req, res, next) {
  try {
    const key = validate(featureFlagKeySchema, req.params.key);
    const { description, enabled, rolloutPercent } = validate(updateFeatureFlagSchema, req.body || {});

    const audited = await auditEnabled({
      actorFirebaseUid: req.user.firebaseUid,
      resourceType: 'feature_flag',
      resourceId: key,
    });

    // The change and its record commit together, or neither does (ADMIN-007).
    const { after: updated } = await updateFeatureFlagWithAudit(
      { key, description, enabled, rolloutPercent },
      (before, after) => audited && ({
        actorUserId: req.user.id,
        actorFirebaseUid: req.user.firebaseUid,
        action: 'feature_flag.update',
        resourceType: 'feature_flag',
        resourceId: key,
        metadata: {
          // Kept at the top level for existing readers of the audit log.
          enabled: after.enabled,
          rollout_percent: after.rollout_percent,
          before: flagState(before),
          after: flagState(after),
          request: requestContext(req),
        },
      })
    );

    clearFeatureFlagCache();
    return res.json({ flag: updated });
  } catch (error) {
    return next(error);
  }
}

async function getAnalytics(req, res, next) {
  try {
    const { days } = validate(adminAnalyticsQuerySchema, req.query || {});
    const { events, truncated, totalEvents } = await getUsageSummary({ days });
    await auditRead(req, 'admin.analytics.read', { days });
    return res.json({ days, events, truncated, totalEvents });
  } catch (error) {
    return next(error);
  }
}

async function getAdminAuditLogs(req, res, next) {
  try {
    const { limit } = validate(adminAuditQuerySchema, req.query || {});
    const logs = await getAuditLogs({ limit });
    await auditRead(req, 'admin.audit_logs.read', { limit });
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
