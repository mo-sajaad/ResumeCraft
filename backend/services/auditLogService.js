const auditLogRepository = require('../modules/admin/repositories/auditLogRepository');
const logger = require('../observability/logger');

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
}) {
  try {
    await auditLogRepository.insertAuditLog({
      actorUserId,
      actorFirebaseUid,
      action,
      resourceType,
      resourceId,
      metadata,
    });
  } catch (error) {
    logger.error({ err: error, auditAction: action }, 'Audit log write failed');
  }
}

module.exports = {
  createAuditLog,
};
