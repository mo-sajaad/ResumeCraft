const auditLogRepository = require('../modules/admin/repositories/auditLogRepository');
const logger = require('../observability/logger');

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
  createAuditLog,
  requestContext,
};
