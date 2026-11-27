const auditLogRepository = require('../modules/admin/repositories/auditLogRepository');
const logger = require('../observability/logger');
const { isFeatureEnabled } = require('./featureFlagService');

const MAX_USER_AGENT = 256;

// Who sent the request, for the audit record (ADMIN-007). The request ID is
// the one pino-http gives the request.
function requestContext(req) {
  if (!req) return undefined;
  const userAgent = typeof req.get === 'function' ? req.get('user-agent') : undefined;
  return {
    requestId: req.id === undefined ? null : String(req.id),
    ip: req.ip || null,
    userAgent: userAgent ? String(userAgent).slice(0, MAX_USER_AGENT) : null,
  };
}

// The audit_logs flag turns persistence off. A missing flag or a failed
// lookup still writes, so no record is lost to a flag fault (ADMIN-005).
// A change to audit_logs itself is always recorded.
async function auditEnabled({ actorFirebaseUid, resourceType, resourceId }) {
  if (resourceType === 'feature_flag' && resourceId === 'audit_logs') return true;
  try {
    return await isFeatureEnabled('audit_logs', actorFirebaseUid, { ifMissing: true });
  } catch (error) {
    logger.warn({ err: error }, 'audit_logs flag lookup failed; writing the audit entry');
    return true;
  }
}

// Best effort: a failed audit write is logged and never reaches the caller, so
// it cannot stop or half-complete a sign-in or sign-out (IDENTITY-008,
// ADMIN-008). Changes that must not happen unrecorded write their audit entry
// in the same transaction instead (see the feature flag update).
async function createAuditLog({
  actorUserId,
  actorFirebaseUid,
  action,
  resourceType,
  resourceId,
  metadata,
  request,
}) {
  if (!(await auditEnabled({ actorFirebaseUid, resourceType, resourceId }))) return;
  const context = requestContext(request);
  try {
    await auditLogRepository.insertAuditLog({
      actorUserId,
      actorFirebaseUid,
      action,
      resourceType,
      resourceId,
      metadata: context ? { ...metadata, request: context } : metadata,
    });
  } catch (error) {
    logger.error({ err: error, auditAction: action }, 'Audit log write failed');
  }
}

module.exports = {
  auditEnabled,
  createAuditLog,
  requestContext,
};
