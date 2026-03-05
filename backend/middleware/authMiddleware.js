const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token missing.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const firebaseUid = payload.uid || payload.userId;

    if (!firebaseUid) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    const result = await pool.query(
      'SELECT id, firebase_uid, email FROM users WHERE firebase_uid = $1 LIMIT 1',
      [firebaseUid]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'User not found for provided token.' });
    }

    const appUser = result.rows[0];
    req.user = {
      id: appUser.id,
      firebaseUid: appUser.firebase_uid,
      email: appUser.email,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = authenticateJWT;