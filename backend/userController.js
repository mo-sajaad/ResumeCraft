// userController.js
const { pool } = require('./db');

// Get user by UID
const getUser = async (uid) => {
  const result = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [uid]);
  return result.rows[0];
};

// Update user profile
const updateUser = async (uid, data) => {
  const { full_name, phone_e164, location_text, linkedin_url, avatar_url } = data;
  const result = await pool.query(
    `UPDATE users
     SET full_name = $1, phone_e164 = $2, location_text = $3, linkedin_url = $4, avatar_url = $5, updated_at = NOW()
     WHERE firebase_uid = $6
     RETURNING *`,
    [full_name, phone_e164, location_text, linkedin_url, avatar_url, uid]
  );
  return result.rows[0];
};

module.exports = { getUser, updateUser };
