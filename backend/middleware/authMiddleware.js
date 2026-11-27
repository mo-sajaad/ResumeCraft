const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { SESSION_COOKIE_NAME } = require('../modules/identity/sessionCookie');

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
  return cookies[SESSION_COOKIE_NAME] || null;
}

// Resolves a session token to { user }, or to { invalid: message } for a bad,
// expired or revoked session. Throws on a server failure.
async function resolveSession(token) {
  let payload;
  try {
    payload = jwt.verify(token, jwtSecretOrThrow());
  } catch (error) {
    // Only a bad session is 401 (TokenExpiredError and NotBeforeError extend
    // JsonWebTokenError). A database failure or missing secret is a server
    // error, so it must not look like an expired session (IDENTITY-007).
    if (error instanceof jwt.JsonWebTokenError) return { invalid: 'Invalid or expired token.' };
    throw error;
  }

  const firebaseUid = payload.uid || payload.userId;

  if (!firebaseUid) {
    return { invalid: 'Invalid token payload.' };
  }

  const result = await pool.query(
    'SELECT id, firebase_uid, email, token_version FROM users WHERE firebase_uid = $1 LIMIT 1',
    [firebaseUid]
  );

  if (!result.rows.length) {
    return { invalid: 'User not found for provided token.' };
  }

  const appUser = result.rows[0];
  const currentTokenVersion = Number(appUser.token_version || 0);
  const tokenVersion = Number(payload.tokenVersion || 0);

  if (tokenVersion !== currentTokenVersion) {
    return { invalid: 'Session has been revoked. Please sign in again.' };
  }

  return {
    user: {
      id: appUser.id,
      firebaseUid: appUser.firebase_uid,
      email: appUser.email,
      tokenVersion: currentTokenVersion,
    },
  };
}

async function authenticateJWT(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ message: 'Authorization token missing.' });
  }

  try {
    const session = await resolveSession(token);
    if (session.invalid) {
      return res.status(401).json({ message: session.invalid });
    }

    req.user = session.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Sets req.user for a valid session and continues without it for a missing,
// invalid or expired one. For logout, which must clear any cookie (IDENTITY-012).
async function authenticateJWTIfValid(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return next();

  try {
    const session = await resolveSession(token);
    if (session.user) req.user = session.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticateJWT;
module.exports.authenticateJWTIfValid = authenticateJWTIfValid;
