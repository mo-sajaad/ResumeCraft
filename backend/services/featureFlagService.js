const featureFlagRepository = require('../modules/admin/repositories/featureFlagRepository');

function hashStringToPercent(input) {
  let hash = 0;
  const source = String(input || 'anon');
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
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
