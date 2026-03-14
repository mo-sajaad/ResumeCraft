const pool = require('../../../config/db');

async function listAllFlags() {
  const result = await pool.query('SELECT key, enabled, rollout_percent FROM feature_flags');
  return result.rows;
}

module.exports = {
  listAllFlags,
};
