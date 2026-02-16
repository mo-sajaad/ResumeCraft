// authController.js
const admin = require('../firebaseAdmin');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

// Generate JWT token
const generateJWT = (uid, email) => {
  const payload = { uid, email };
  return jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
};

// Verify Firebase ID token
const verifyFirebaseToken = async (firebaseToken) => {
  try {
    return await admin.auth().verifyIdToken(firebaseToken);
  } catch (error) {
    throw new Error('Invalid Firebase token');
  }
};

// DB: Get user by Firebase UID
const getUserByFirebaseUid = async (uid) => {
  const result = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [uid]);
  return result.rows[0];
};

// DB: Create new user
const createUser = async ({ uid, email, fullName }) => {
  const result = await pool.query(
    'INSERT INTO users (firebase_uid, email, full_name) VALUES ($1, $2, $3) RETURNING *',
    [uid, email, fullName]
  );
  return result.rows[0];
};

// DB: Get or create user
const getOrCreateUser = async (decodedToken) => {
  let user = await getUserByFirebaseUid(decodedToken.uid);
  if (!user) {
    user = await createUser({
      uid: decodedToken.uid,
      email: decodedToken.email,
      fullName: decodedToken.name || null,
    });
  }
  return user;
};

module.exports = {
  generateJWT,
  verifyFirebaseToken,
  getOrCreateUser,
};
