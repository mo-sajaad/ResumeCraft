const crypto = require('node:crypto');
const featureFlagRepository = require('../modules/admin/repositories/featureFlagRepository');

// SHA-256 keeps the cohorts of similarly named flags independent (ADMIN-012).
// The modulo bias of 2^32 % 100 is negligible.
function hashStringToPercent(input) {
  const digest = crypto.createHash('sha256').update(String(input || 'anon')).digest();
  return digest.readUInt32BE(0) % 100;
}

// Flag rows are read at most once per CACHE_TTL_MS per process, so checks do
// not cost a query per request (ADMIN-005). Other instances see a change
// within that time; this one sees its own changes at once.
const CACHE_TTL_MS = 5000;
let cache = null;
let pending = null;

function clearFeatureFlagCache() {
  cache = null;
  pending = null;
}

async function loadFlagRows() {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;
  if (!pending) {
    const load = featureFlagRepository.listAllFlags().then(
      (rows) => {
        if (pending === load) {
          cache = { rows, expiresAt: Date.now() + CACHE_TTL_MS };
          pending = null;
        }
        return rows;
      },
      (error) => {
        if (pending === load) pending = null;
        throw error;
      }
    );
    pending = load;
  }
  return pending;
}

// A null-prototype object, so names such as `constructor` are not flags.
async function getAllFlagsForUser(firebaseUid) {
  const rows = await loadFlagRows();
  const uid = firebaseUid || 'anonymous';

  return rows.reduce((acc, row) => {
    const active = row.enabled && hashStringToPercent(`${uid}:${row.key}`) < Number(row.rollout_percent || 0);
    acc[row.key] = Boolean(active);
    return acc;
  }, Object.create(null));
}

// Whether `key` is on for this user. A flag with no row counts as `ifMissing`.
// A failed lookup rejects; each caller decides how to fail.
async function isFeatureEnabled(key, firebaseUid, { ifMissing = false } = {}) {
  const flags = await getAllFlagsForUser(firebaseUid);
  return Object.hasOwn(flags, key) ? flags[key] : ifMissing;
}

// Whether `key` is enabled for everyone, ignoring the rollout percent: a
// global switch. A flag with no row counts as `ifMissing`; a failed lookup
// rejects.
async function isSwitchEnabled(key, { ifMissing = false } = {}) {
  const row = (await loadFlagRows()).find((flag) => flag.key === key);
  return row ? row.enabled === true : ifMissing;
}

module.exports = {
  getAllFlagsForUser,
  isFeatureEnabled,
  isSwitchEnabled,
  clearFeatureFlagCache,
};
