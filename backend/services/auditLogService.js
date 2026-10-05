const auditLogRepository = require('../modules/admin/repositories/auditLogRepository');

async function createAuditLog({
  actorUserId,
  actorFirebaseUid,
  action,
  resourceType,
  resourceId,
  metadata,
}) {
  await auditLogRepository.insertAuditLog({
    actorUserId,
    actorFirebaseUid,
    action,
    resourceType,
    resourceId,
    metadata,
  });
}

module.exports = {
  createAuditLog,
};
