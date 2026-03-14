const pool = require('../../../config/db');

async function insertAuditLog({ actorUserId, actorFirebaseUid, action, resourceType, resourceId, metadata }) {
  await pool.query(
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
