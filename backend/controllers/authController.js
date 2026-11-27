const jwt = require('jsonwebtoken');

const admin = require('../firebaseAdmin');
const logger = require('../observability/logger');
const {
  findOrCreateUser,
  getUserByFirebaseUid,
  incrementTokenVersion,
  linkUserToVerifiedEmail,
} = require('../services/userService');
const { createAuditLog } = require('../services/auditLogService');
const { validate } = require('../shared/http/validators');
const { exchangeTokenSchema } = require('../modules/identity/schemas/authSchemas');
const { SESSION_COOKIE_NAME } = require('../modules/identity/sessionCookie');

// Short, because the session is only re-checked against Firebase on exchange.
const TOKEN_TTL_SECONDS = 24 * 60 * 60;
// Firebase says the token or its account is no longer valid (IDENTITY-005).
const REVOKED_ACCOUNT_CODES = new Set([
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
]);
const REVOKED_ACCOUNT_MESSAGE =
  'This sign-in is no longer valid because the account was signed out, disabled or deleted. Sign in again.';
// firebase-admin uses auth/argument-error both for a bad token and for a failed
// download of Google's public keys (it passes the network error's message
// through). Every bad-token message it builds links to this page, except the
// unknown-key one. Anything else is a server failure, not a 401 (IDENTITY-007).
const BAD_TOKEN_MESSAGE = /firebase\.google\.com\/docs\/auth\/admin\/verify-id-tokens|does not correspond to a known public key/;
const MAX_LOGGED_SDK_MESSAGE = 300;
const EMAIL_IN_USE_MESSAGE =
  'This email address already belongs to another ResumeCraft account. '
  + 'Sign in to that account the way you originally did.';
// The frontend matches this code; keep it stable.
const EMAIL_NOT_VERIFIED = {
  code: 'EMAIL_NOT_VERIFIED',
  message: 'Verify your email address to continue.',
};

function jwtSecretOrThrow() {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret || !secret.trim()) {
    const error = new Error('Missing JWT_SECRET_KEY. Refusing to issue auth tokens.');
    error.statusCode = 500;
    throw error;
  }
  return secret;
}

function createAppToken({ uid, email, tokenVersion }) {
  return jwt.sign(
    {
      userId: uid,
      uid,
      email,
      tokenVersion,
    },
    jwtSecretOrThrow(),
    { expiresIn: `${TOKEN_TTL_SECONDS}s` }
  );
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  };
}

// A reused email moves to the new Firebase UID only with proof of ownership.
async function resolveUser({ uid, email, email_verified: emailVerified }, fullName) {
  try {
    await findOrCreateUser(uid, email, fullName);
  } catch (error) {
    if (error.code !== 'EMAIL_IN_USE' || emailVerified !== true) throw error;
    await linkUserToVerifiedEmail(uid, email, fullName);
  }
}

function isBadFirebaseToken(error) {
  if (error.code === 'auth/id-token-expired') return true;
  return error.code === 'auth/argument-error' && BAD_TOKEN_MESSAGE.test(String(error.message || ''));
}

function isFirebaseError(error) {
  return typeof error.code === 'string' && /^(auth|app)\//.test(error.code);
}

// The SDK messages hold no token, cookie or email; the error serializer drops
// messages, so this one is logged on its own, shortened.
function logExchangeFailure(error, outcome) {
  logger.warn(
    {
      outcome,
      sdkCode: error.code,
      sdkMessage: String(error.message || '').slice(0, MAX_LOGGED_SDK_MESSAGE),
    },
    'Firebase token exchange failed'
  );
}

async function exchangeFirebaseToken(req, res, next) {
  try {
    if (!admin) {
      return res.status(500).json({ message: 'Firebase Admin is not configured on the server' });
    }

    const { firebaseToken, fullName: requestFullName } = validate(exchangeTokenSchema, req.body || {});

    // checkRevoked also rejects tokens of disabled or deleted users and tokens
    // issued before a password change or reset. It needs permission to look up users.
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken, true);

    if (!decodedToken.uid || !decodedToken.email) {
      return res.status(400).json({ message: 'Firebase token must include uid and email' });
    }

    // Applies to every sign-in provider and comes before any account lookup.
    if (decodedToken.email_verified !== true) {
      return res.status(403).json(EMAIL_NOT_VERIFIED);
    }

    const fullName = typeof requestFullName === 'string' ? requestFullName : decodedToken.name || null;

    await resolveUser(decodedToken, fullName);
    const appUser = await getUserByFirebaseUid(decodedToken.uid);

    if (!appUser) {
      return res.status(404).json({ message: 'Unable to resolve user for token exchange' });
    }

    const token = createAppToken({
      uid: decodedToken.uid,
      email: decodedToken.email,
      tokenVersion: Number(appUser.token_version || 0),
    });

    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());

    await createAuditLog({
      actorUserId: appUser.id,
      actorFirebaseUid: decodedToken.uid,
      action: 'auth.login',
      resourceType: 'session',
      resourceId: SESSION_COOKIE_NAME,
      metadata: { provider: 'firebase' },
    });

    return res.json({
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || null,
      },
    });
  } catch (error) {
    if (isBadFirebaseToken(error)) {
      logExchangeFailure(error, 'invalid_token');
      return res.status(401).json({ message: 'Invalid Firebase token' });
    }
    if (REVOKED_ACCOUNT_CODES.has(error.code)) {
      logExchangeFailure(error, 'revoked');
      return res.status(401).json({ message: REVOKED_ACCOUNT_MESSAGE });
    }
    if (isFirebaseError(error)) {
      // For example the key download failed or the user lookup was refused.
      logExchangeFailure(error, 'server_error');
    }
    if (error.code === 'EMAIL_IN_USE') {
      return res.status(409).json({ message: EMAIL_IN_USE_MESSAGE });
    }
    if (error.code === 'ACCOUNT_DELETED') {
      return res.status(403).json({ code: 'ACCOUNT_DELETED', message: 'This account has been deleted. Contact support to restore it.' });
    }
    return next(error);
  }
}

async function logout(req, res, next) {
  // First, so the browser drops the cookie even if the revocation fails.
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());

  try {
    if (req.user?.firebaseUid) {
      await incrementTokenVersion(req.user.firebaseUid);
      await createAuditLog({
        actorUserId: req.user.id,
        actorFirebaseUid: req.user.firebaseUid,
        action: 'auth.logout',
        resourceType: 'session',
        resourceId: SESSION_COOKIE_NAME,
      });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

// Ends every API session of the user, including this one; the caller then
// exchanges a fresh Firebase ID token. Used after a password change.
async function revokeSessions(req, res, next) {
  try {
    await incrementTokenVersion(req.user.firebaseUid);
    await createAuditLog({
      actorUserId: req.user.id,
      actorFirebaseUid: req.user.firebaseUid,
      action: 'auth.sessions_revoked',
      resourceType: 'session',
      resourceId: SESSION_COOKIE_NAME,
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  exchangeFirebaseToken,
  logout,
  revokeSessions,
};
