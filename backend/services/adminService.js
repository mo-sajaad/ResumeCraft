const { interfaces: { adminRepository } } = require('../modules/admin');

function getAdminUidSet() {
  const raw = process.env.ADMIN_FIREBASE_UIDS || '';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isAdminUid(firebaseUid) {
  if (!firebaseUid) return false;
  return getAdminUidSet().has(firebaseUid);
}

async function listFeatureFlags() {
  return adminRepository.listFeatureFlags();
}

async function upsertFeatureFlag({ key, description, enabled, rolloutPercent }) {
  return adminRepository.upsertFeatureFlag({ key, description, enabled, rolloutPercent });
}

async function getUsageSummary({ days = 30 }) {
  return adminRepository.listUsageSummary(days);
}

async function getAuditLogs({ limit = 100 }) {
  return adminRepository.listAuditLogs(limit);
}

module.exports = {
  isAdminUid,
  listFeatureFlags,
  upsertFeatureFlag,
  getUsageSummary,
  getAuditLogs,
};
