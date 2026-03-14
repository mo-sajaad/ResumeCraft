const { interfaces: { auditLogRepository } } = require('../modules/admin');

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
