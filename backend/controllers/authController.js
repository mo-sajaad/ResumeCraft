const jwt = require('jsonwebtoken');

const admin = require('../firebaseAdmin');
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

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
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

async function exchangeFirebaseToken(req, res, next) {
  try {
    if (!admin) {
      return res.status(500).json({ message: 'Firebase Admin is not configured on the server' });
    }

    const { firebaseToken, fullName: requestFullName } = validate(exchangeTokenSchema, req.body || {});

    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);

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
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return res.status(401).json({ message: 'Invalid Firebase token' });
    }
    if (error.code === 'EMAIL_IN_USE') {
      return res.status(409).json({ message: EMAIL_IN_USE_MESSAGE });
    }
    return next(error);
  }
}

async function logout(req, res, next) {
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

    res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  exchangeFirebaseToken,
  logout,
};
