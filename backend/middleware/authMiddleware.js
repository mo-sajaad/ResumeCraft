const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const COOKIE_NAME = 'rc_auth';

function jwtSecretOrThrow() {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret || !secret.trim()) {
    const error = new Error('Missing JWT_SECRET_KEY.');
    error.statusCode = 500;
    throw error;
  }
  return secret;
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  if (!raw) return {};

  return raw.split(';').reduce((acc, part) => {
    const [name, ...valueParts] = part.trim().split('=');
    if (!name) return acc;
    acc[name] = decodeURIComponent(valueParts.join('='));
    return acc;
  }, {});
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] || null;
}

async function authenticateJWT(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ message: 'Authorization token missing.' });
  }

  try {
    const payload = jwt.verify(token, jwtSecretOrThrow());
    const firebaseUid = payload.uid || payload.userId;

    if (!firebaseUid) {
      return res.status(401).json({ message: 'Invalid token payload.' });
    }

    const result = await pool.query(
      'SELECT id, firebase_uid, email, token_version FROM users WHERE firebase_uid = $1 LIMIT 1',
      [firebaseUid]
    );

    if (!result.rows.length) {
      return res.status(401).json({ message: 'User not found for provided token.' });
    }

    const appUser = result.rows[0];
    const currentTokenVersion = Number(appUser.token_version || 0);
    const tokenVersion = Number(payload.tokenVersion || 0);

    if (tokenVersion !== currentTokenVersion) {
      return res.status(401).json({ message: 'Session has been revoked. Please sign in again.' });
    }

    req.user = {
      id: appUser.id,
      firebaseUid: appUser.firebase_uid,
      email: appUser.email,
      tokenVersion: currentTokenVersion,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = authenticateJWT;
