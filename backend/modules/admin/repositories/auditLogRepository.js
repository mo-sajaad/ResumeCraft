const pool = require('../../../config/db');

// `db` is the pool or a client inside an open transaction.
async function insertAuditLog({ actorUserId, actorFirebaseUid, action, resourceType, resourceId, metadata }, db = pool) {
  await db.query(
    `INSERT INTO audit_logs (actor_user_id, actor_firebase_uid, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actorUserId || null,
      actorFirebaseUid || null,
      action,
      resourceType || null,
      resourceId || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

module.exports = {
  insertAuditLog,
};
