// authController.js

const jwt = require('jsonwebtoken');

const admin = require('../firebaseAdmin');
const { findOrCreateUser } = require('../services/userService');

function createAppToken({ uid, email }) {
  return jwt.sign(
    {
      userId: uid,
      uid,
      email,
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: '7d' }
  );
}

// Verify Firebase ID token
async function exchangeFirebaseToken(req, res, next) {
  try {
    if (!admin) {
      return res.status(500).json({ error: 'Firebase Admin is not configured on the server' });
    };
    const firebaseToken = req.body?.firebaseToken;
    if (!firebaseToken) {
      return res.status(400).json({ error: 'firebaseToken is required' });
    }

    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);

    if (!decodedToken.uid || !decodedToken.email) {
      return res.status(400).json({ error: 'Firebase token must include uid and email' });
    }

    await findOrCreateUser(decodedToken.uid, decodedToken.email);
    const token = createAppToken({ uid: decodedToken.uid, email: decodedToken.email });

    return res.json({
      token,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || null,
      },
});
  } catch (error) {
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return res.status(401).json({ error: 'Invalid Firebase token' });
  }
  return next(error);

  }
}

module.exports = {
    exchangeFirebaseToken
}