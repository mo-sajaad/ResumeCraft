const pool = require('../config/db');

async function findOrCreateUser(firebaseUid, email) {
  const existing = await pool.query(
    'SELECT * FROM users WHERE firebase_uid = $1',
    [firebaseUid]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO users (firebase_uid, email)
     VALUES ($1, $2)
     RETURNING *`,
    [firebaseUid, email]
  );

  return result.rows[0];
}

module.exports = { findOrCreateUser };
