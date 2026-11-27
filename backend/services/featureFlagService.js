const crypto = require('node:crypto');
const featureFlagRepository = require('../modules/admin/repositories/featureFlagRepository');

// SHA-256 keeps the cohorts of similarly named flags independent (ADMIN-012).
// The modulo bias of 2^32 % 100 is negligible.
function hashStringToPercent(input) {
  const digest = crypto.createHash('sha256').update(String(input || 'anon')).digest();
  return digest.readUInt32BE(0) % 100;
}

async function getAllFlagsForUser(firebaseUid) {
  const rows = await featureFlagRepository.listAllFlags();
  const uid = firebaseUid || 'anonymous';

  return rows.reduce((acc, row) => {
    const active = row.enabled && hashStringToPercent(`${uid}:${row.key}`) < Number(row.rollout_percent || 0);
    acc[row.key] = Boolean(active);
    return acc;
  }, {});
}

module.exports = {
  getAllFlagsForUser,
};
